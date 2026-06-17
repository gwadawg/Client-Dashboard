/**
 * GoHighLevel API v2 client for the acquisition location (read + write).
 */

import {
  GHL_ACQUISITION_LOCATION_ID,
  GHL_WM_PIPELINE_ID,
} from './acquisition-config';

const GHL_BASE = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';

export class GhlAcquisitionApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
  ) {
    super(message);
    this.name = 'GhlAcquisitionApiError';
  }
}

export type GhlContact = {
  id?: string;
  locationId?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  phone?: string;
  source?: string;
  customFields?: Array<{ id?: string; key?: string; value?: string; fieldValue?: string }>;
  customField?: GhlContact['customFields'];
  tags?: string[];
};

export type GhlCustomFieldInput = { id: string; value: string };

function getToken(): string {
  const token =
    process.env.GHL_ACQUISITION_API_TOKEN?.trim() ||
    process.env.GHL_API_TOKEN?.trim();
  if (!token) {
    throw new Error('GHL_ACQUISITION_API_TOKEN is not configured');
  }
  return token;
}

async function ghlRequest<T = unknown>(
  method: string,
  path: string,
  options?: { body?: unknown; locationId?: string },
): Promise<T> {
  const locationId = options?.locationId ?? GHL_ACQUISITION_LOCATION_ID;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getToken()}`,
    Version: GHL_VERSION,
    Accept: 'application/json',
    locationId,
    ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
  };

  const res = await fetch(`${GHL_BASE}${path}`, {
    method,
    headers,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  if (!res.ok) {
    throw new GhlAcquisitionApiError(
      `GHL ${method} ${path} → ${res.status}`,
      res.status,
      parsed,
    );
  }

  return parsed as T;
}

export function ghlContactName(contact: GhlContact | null | undefined): string | null {
  if (!contact) return null;
  if (contact.name?.trim()) return contact.name.trim();
  const parts = [contact.firstName, contact.lastName].filter(Boolean);
  if (parts.length) return parts.join(' ').trim();
  return null;
}

export function ghlCustomFieldValue(
  contact: GhlContact | null | undefined,
  ...labels: string[]
): string | null {
  const fields = contact?.customFields ?? contact?.customField ?? [];
  if (!Array.isArray(fields)) return null;
  const needles = labels.map((l) => l.toLowerCase());
  for (const f of fields) {
    const key = String(f.id ?? f.key ?? '').toLowerCase();
    const hit = needles.some((n) => key.includes(n));
    if (!hit) continue;
    const v = f.value ?? f.fieldValue;
    if (v == null || v === '') continue;
    return String(v).trim();
  }
  return null;
}

export function ghlCustomFieldById(
  contact: GhlContact | null | undefined,
  fieldId: string,
): string | null {
  const fields = contact?.customFields ?? contact?.customField ?? [];
  if (!Array.isArray(fields)) return null;
  for (const f of fields) {
    if (f.id !== fieldId && f.key !== fieldId) continue;
    const v = f.value ?? f.fieldValue;
    if (v == null || v === '') return null;
    return String(v).trim();
  }
  return null;
}

export async function getAcquisitionContact(contactId: string): Promise<GhlContact> {
  const data = await ghlRequest<{ contact?: GhlContact } & GhlContact>(
    'GET',
    `/contacts/${encodeURIComponent(contactId)}`,
  );
  return (data as { contact?: GhlContact }).contact ?? (data as GhlContact);
}

export async function updateAcquisitionContactCustomFields(
  contactId: string,
  fields: GhlCustomFieldInput[],
): Promise<void> {
  if (!fields.length) return;
  await ghlRequest('PUT', `/contacts/${encodeURIComponent(contactId)}`, {
    body: {
      customFields: fields.map((f) => ({ id: f.id, value: f.value })),
    },
  });
}

export async function addAcquisitionContactNote(
  contactId: string,
  body: string,
): Promise<void> {
  const trimmed = body.trim();
  if (!trimmed) return;
  await ghlRequest('POST', `/contacts/${encodeURIComponent(contactId)}/notes`, {
    body: { body: trimmed },
  });
}

type PipelineStage = { id: string; name: string };
type Pipeline = { id: string; name: string; stages?: PipelineStage[] };

let pipelineStageCache: Map<string, string> | null = null;

async function resolvePipelineStageId(stageName: string): Promise<string | null> {
  const envId = process.env.GHL_STAGE_DEMO_BOOKED_ID?.trim();
  if (stageName === 'Demo Booked' && envId) return envId;

  if (!pipelineStageCache) {
    pipelineStageCache = new Map();
    try {
      const data = await ghlRequest<{ pipelines?: Pipeline[] }>(
        'GET',
        `/opportunities/pipelines?locationId=${encodeURIComponent(GHL_ACQUISITION_LOCATION_ID)}`,
      );
      for (const pipe of data.pipelines ?? []) {
        for (const stage of pipe.stages ?? []) {
          if (stage.name && stage.id) {
            pipelineStageCache.set(stage.name.toLowerCase(), stage.id);
          }
        }
      }
    } catch {
      pipelineStageCache = new Map();
    }
  }

  return pipelineStageCache.get(stageName.toLowerCase()) ?? null;
}

export async function updateAcquisitionOpportunityStage(
  contactId: string,
  stageName: string,
): Promise<void> {
  const stageId = await resolvePipelineStageId(stageName);
  if (!stageId) {
    throw new Error(`Unknown GHL pipeline stage: ${stageName}`);
  }

  const search = await ghlRequest<{ opportunities?: Array<{ id: string; pipelineId?: string }> }>(
    'POST',
    '/opportunities/search',
    {
      body: {
        locationId: GHL_ACQUISITION_LOCATION_ID,
        contactId,
        pipelineId: GHL_WM_PIPELINE_ID,
      },
    },
  );

  const opportunities = search.opportunities ?? [];
  const existing = opportunities.find((o) => o.pipelineId === GHL_WM_PIPELINE_ID) ?? opportunities[0];

  if (existing?.id) {
    await ghlRequest('PUT', `/opportunities/${encodeURIComponent(existing.id)}`, {
      body: { pipelineStageId: stageId },
    });
    return;
  }

  await ghlRequest('POST', '/opportunities/', {
    body: {
      locationId: GHL_ACQUISITION_LOCATION_ID,
      contactId,
      pipelineId: GHL_WM_PIPELINE_ID,
      pipelineStageId: stageId,
      name: 'Acquisition lead',
      status: 'open',
    },
  });
}

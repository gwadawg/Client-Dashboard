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

export type GhlCallMessage = {
  id: string;
  contactId?: string;
  conversationId?: string;
  dateAdded?: string;
  direction?: string;
  messageType?: string;
  type?: number | string;
  status?: string;
  userId?: string;
  userName?: string;
  from?: string;
  to?: string;
  attachments?: string[];
  meta?: {
    callDuration?: string | number;
    callStatus?: string;
    userName?: string;
    call?: {
      duration?: string | number;
      status?: string;
    };
  };
  source?: string;
};

export type GhlUser = {
  id?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
};

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

/** Map GHL user id → display name for the acquisition location (requires users.readonly). */
export async function listAcquisitionLocationUsers(): Promise<Map<string, string>> {
  const data = await ghlRequest<{ users?: GhlUser[] }>(
    'GET',
    `/users/?locationId=${encodeURIComponent(GHL_ACQUISITION_LOCATION_ID)}`,
  );
  const map = new Map<string, string>();
  for (const user of data.users ?? []) {
    if (!user.id) continue;
    const name =
      user.name?.trim() ||
      [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
      user.email?.trim();
    if (name) map.set(user.id, name);
  }
  return map;
}

/** Fetch one export page (for debugging / flexible parsing). */
export async function fetchGhlCallExportPage(
  cursor?: string,
  pageSize = 100,
  channel?: string,
): Promise<Record<string, unknown>> {
  const params = new URLSearchParams({
    locationId: GHL_ACQUISITION_LOCATION_ID,
    limit: String(pageSize),
  });
  if (channel) params.set('channel', channel);
  if (cursor) params.set('cursor', cursor);
  return ghlRequest<Record<string, unknown>>('GET', `/conversations/messages/export?${params}`);
}

/** Some locations reject channel=Call on export; fall back to unfiltered export. */
export async function fetchGhlCallExportPageWithFallback(
  cursor?: string,
  pageSize = 100,
): Promise<{ data: Record<string, unknown>; channel: string | null }> {
  const attempts: Array<string | undefined> = ['Call', 'call', undefined];
  let lastErr: unknown;
  for (const channel of attempts) {
    try {
      const data = await fetchGhlCallExportPage(cursor, pageSize, channel);
      return { data, channel: channel ?? null };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

function parseExportBatch(data: Record<string, unknown>): GhlCallMessage[] {
  const envelope =
    (data.messages as Record<string, unknown> | undefined) ??
    (data.data as Record<string, unknown> | undefined) ??
    data;
  if (Array.isArray(envelope)) return envelope as GhlCallMessage[];
  if (Array.isArray(envelope?.messages)) return envelope.messages as GhlCallMessage[];
  if (Array.isArray(data.messages)) return data.messages as GhlCallMessage[];
  return [];
}

function parseExportCursor(data: Record<string, unknown>, batch: GhlCallMessage[]) {
  const envelope =
    (data.messages as Record<string, unknown> | undefined) ??
    (data.data as Record<string, unknown> | undefined) ??
    data;
  const nextPage = Boolean(
    (envelope as Record<string, unknown> | undefined)?.nextPage ?? data.nextPage,
  );
  const lastMessageId = String(
    (envelope as Record<string, unknown> | undefined)?.lastMessageId ??
      data.lastMessageId ??
      batch[batch.length - 1]?.id ??
      '',
  );
  return { nextPage, lastMessageId };
}

/** Page call messages for the acquisition location (requires conversations/message.readonly). */
export async function* exportGhlCallMessages(pageSize = 100): AsyncGenerator<GhlCallMessage> {
  let cursor: string | undefined;
  let channelUsed: string | null = 'Call';
  for (;;) {
    const { data, channel } = await fetchGhlCallExportPageWithFallback(cursor, pageSize);
    channelUsed = channel;
    const batch = parseExportBatch(data);
    for (const message of batch) yield message;
    const { nextPage, lastMessageId } = parseExportCursor(data, batch);
    if (!nextPage || !lastMessageId || !batch.length) break;
    cursor = lastMessageId;
  }
  void channelUsed;
}

/** Resolve a playable HTTPS URL when GHL redirects to hosted audio. */
export async function resolveGhlMessageRecordingUrl(messageId: string): Promise<string | null> {
  const path = `/conversations/messages/${encodeURIComponent(messageId)}/locations/${encodeURIComponent(GHL_ACQUISITION_LOCATION_ID)}/recording`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getToken()}`,
    Version: GHL_VERSION,
    Accept: '*/*',
    locationId: GHL_ACQUISITION_LOCATION_ID,
  };

  let url = `${GHL_BASE}${path}`;
  for (let hop = 0; hop < 5; hop++) {
    const res = await fetch(url, { method: 'GET', headers, redirect: 'manual' });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (location?.startsWith('http')) return location;
      if (location) {
        url = location.startsWith('/') ? `${GHL_BASE}${location}` : location;
        continue;
      }
    }
    const ct = res.headers.get('content-type') ?? '';
    if (res.ok && ct.includes('application/json')) {
      const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      const candidate = body?.url ?? body?.recordingUrl ?? body?.recording_url;
      if (typeof candidate === 'string' && candidate.startsWith('http')) return candidate;
    }
    break;
  }
  return null;
}

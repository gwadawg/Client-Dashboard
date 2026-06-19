import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizePhone } from './acquisition-config';

type JsonObject = Record<string, unknown>;

export type AcquisitionLeadRow = {
  id: string;
  ghl_contact_id: string | null;
  lead_name: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  offer_interest: string | null;
  qualified: boolean | null;
  created_at: string;
  converted_client_id: string | null;
  close_source: string | null;
  sheet_lead_key: string | null;
  ad_name: string | null;
  ad_set: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  raw: unknown;
};

const CHILD_TABLES = [
  'acquisition_appointments',
  'acquisition_offers',
  'acquisition_closes',
  'acquisition_dials',
  'acquisition_calls',
  'acquisition_form_submissions',
] as const;

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

export function phoneDigits10(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

/** GHL auto-creates from outbound dialing: phone only, no name/email/attribution. */
export function isDialOnlyLeadPayload(
  payload: JsonObject,
  row: {
    lead_name: string | null;
    email: string | null;
    source: string | null;
    offer_interest: string | null;
    qualified: boolean | null;
    ad_name: string | null;
    ad_set: string | null;
  },
): boolean {
  if (row.lead_name) return false;
  if (row.email) return false;
  if (row.offer_interest) return false;
  if (row.qualified === true) return false;
  if (row.ad_name || row.ad_set) return false;
  if (str(payload.utm_source) || str(payload.utm_campaign) || str(payload.utm_content)) return false;
  if (str(payload.ad_name ?? payload.adName)) return false;
  // Real marketing/referral leads should carry a source; dial scaffolds arrive unset.
  if (row.source) return false;
  return true;
}

export function isDialOnlyScaffoldProfile(profile: {
  lead_name: string | null;
  email: string | null;
  converted_client_id: string | null;
  funnel_stage: string;
  counts: {
    intro_booked: number;
    intro_showed: number;
    demo_booked: number;
    demo_showed: number;
    offers: number;
    closes: number;
  };
}): boolean {
  if (profile.lead_name?.trim()) return false;
  if (profile.email?.trim()) return false;
  if (profile.converted_client_id) return false;
  if (profile.counts.intro_booked > 0) return false;
  if (profile.counts.intro_showed > 0) return false;
  if (profile.counts.demo_booked > 0) return false;
  if (profile.counts.demo_showed > 0) return false;
  if (profile.counts.offers > 0) return false;
  if (profile.counts.closes > 0) return false;
  return profile.funnel_stage === 'lead';
}

function leadRawObject(raw: unknown): JsonObject {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return { ...(raw as JsonObject) };
  }
  return {};
}

function alternateGhlIds(raw: unknown): Set<string> {
  const obj = leadRawObject(raw);
  const ids = obj.alternate_ghl_contact_ids;
  return new Set(Array.isArray(ids) ? ids.map((id) => str(id)).filter(Boolean) as string[] : []);
}

/** Prefer converted leads, named leads, GHL-linked, then earliest created_at. */
export function scoreLeadForCanonical(
  lead: AcquisitionLeadRow,
  childCount = 0,
): number {
  let score = 0;
  if (lead.converted_client_id) score += 10_000;
  score += childCount * 100;
  if (lead.ghl_contact_id && lead.sheet_lead_key === lead.ghl_contact_id) score += 500;
  if (lead.ghl_contact_id) score += 50;
  if (lead.sheet_lead_key) score += 25;
  if (lead.source) score += 10;
  if (lead.lead_name) score += 5;
  if (lead.email && lead.phone) score += 3;
  const created = Date.parse(lead.created_at);
  if (!Number.isNaN(created)) score -= created / 1e15;
  return score;
}

export function pickCanonicalLead<T extends AcquisitionLeadRow>(
  candidates: T[],
  childCounts?: Map<string, number>,
): T | null {
  if (!candidates.length) return null;
  const sorted = [...candidates].sort(
    (a, b) =>
      scoreLeadForCanonical(b, childCounts?.get(b.id) ?? 0) -
      scoreLeadForCanonical(a, childCounts?.get(a.id) ?? 0),
  );
  return sorted[0] ?? null;
}

export async function findCanonicalAcquisitionLead(
  service: SupabaseClient,
  keys: {
    ghl_contact_id?: string | null;
    phone?: string | null;
    email?: string | null;
  },
): Promise<AcquisitionLeadRow | null> {
  const ghlContactId = str(keys.ghl_contact_id);
  if (ghlContactId) {
    const { data } = await service
      .from('acquisition_leads')
      .select(
        'id, ghl_contact_id, lead_name, email, phone, source, offer_interest, qualified, created_at, converted_client_id, close_source, sheet_lead_key, ad_name, ad_set, utm_source, utm_campaign, utm_content, raw',
      )
      .eq('ghl_contact_id', ghlContactId)
      .maybeSingle();
    if (data?.id) return data as AcquisitionLeadRow;
  }

  const phone = normalizePhone(str(keys.phone));
  if (phone) {
    const { data: leads } = await service
      .from('acquisition_leads')
      .select(
        'id, ghl_contact_id, lead_name, email, phone, source, offer_interest, qualified, created_at, converted_client_id, close_source, sheet_lead_key, ad_name, ad_set, utm_source, utm_campaign, utm_content, raw',
      )
      .eq('phone', phone)
      .order('created_at', { ascending: true });
    const canonical = pickCanonicalLead((leads ?? []) as AcquisitionLeadRow[]);
    if (canonical) return canonical;
  }

  const email = str(keys.email)?.toLowerCase();
  if (email) {
    const { data: leads } = await service
      .from('acquisition_leads')
      .select(
        'id, ghl_contact_id, lead_name, email, phone, source, offer_interest, qualified, created_at, converted_client_id, close_source, sheet_lead_key, ad_name, ad_set, utm_source, utm_campaign, utm_content, raw',
      )
      .ilike('email', email)
      .order('created_at', { ascending: true })
      .limit(10);
    const canonical = pickCanonicalLead((leads ?? []) as AcquisitionLeadRow[]);
    if (canonical) return canonical;
  }

  return null;
}

export function mergeIncomingLeadFields(
  canonical: AcquisitionLeadRow,
  incoming: Partial<AcquisitionLeadRow> & { ghl_contact_id?: string | null },
): Partial<AcquisitionLeadRow> & { raw: JsonObject; updated_at: string } {
  const patch: Partial<AcquisitionLeadRow> & { raw: JsonObject; updated_at: string } = {
    raw: leadRawObject(canonical.raw),
    updated_at: new Date().toISOString(),
  };

  if (!canonical.lead_name && incoming.lead_name) patch.lead_name = incoming.lead_name;
  if (!canonical.email && incoming.email) patch.email = incoming.email;
  if (!canonical.phone && incoming.phone) patch.phone = incoming.phone;
  if (!canonical.source && incoming.source) patch.source = incoming.source;
  if (!canonical.offer_interest && incoming.offer_interest) patch.offer_interest = incoming.offer_interest;
  if (!canonical.qualified && incoming.qualified) patch.qualified = incoming.qualified;
  if (!canonical.ad_name && incoming.ad_name) patch.ad_name = incoming.ad_name;
  if (!canonical.ad_set && incoming.ad_set) patch.ad_set = incoming.ad_set;
  if (!canonical.utm_source && incoming.utm_source) patch.utm_source = incoming.utm_source;
  if (!canonical.utm_campaign && incoming.utm_campaign) patch.utm_campaign = incoming.utm_campaign;
  if (!canonical.utm_content && incoming.utm_content) patch.utm_content = incoming.utm_content;

  const incomingGhl = str(incoming.ghl_contact_id);
  if (incomingGhl) {
    if (!canonical.ghl_contact_id) {
      patch.ghl_contact_id = incomingGhl;
    } else if (incomingGhl !== canonical.ghl_contact_id) {
      const alt = alternateGhlIds(patch.raw);
      alt.add(incomingGhl);
      patch.raw.alternate_ghl_contact_ids = [...alt];
    }
  }

  if (incoming.raw && typeof incoming.raw === 'object' && !Array.isArray(incoming.raw)) {
    patch.raw = { ...patch.raw, ...(incoming.raw as JsonObject) };
  }

  return patch;
}

export async function reassignLeadChildren(
  service: SupabaseClient,
  fromLeadId: string,
  toLeadId: string,
): Promise<void> {
  for (const table of CHILD_TABLES) {
    await service.from(table).update({ lead_id: toLeadId }).eq('lead_id', fromLeadId);
  }
}

export async function linkOrphanDialsToLead(
  service: SupabaseClient,
  leadId: string,
  keys: { ghl_contact_id?: string | null; phone?: string | null },
): Promise<number> {
  let linked = 0;
  const ghlContactId = str(keys.ghl_contact_id);
  const phone = normalizePhone(str(keys.phone));

  if (ghlContactId) {
    const { data: byGhl } = await service
      .from('acquisition_dials')
      .select('id, lead_id')
      .eq('ghl_contact_id', ghlContactId)
      .or(`lead_id.is.null,lead_id.neq.${leadId}`);
    for (const dial of byGhl ?? []) {
      await service.from('acquisition_dials').update({ lead_id: leadId }).eq('id', dial.id);
      await service.from('acquisition_calls').update({ lead_id: leadId }).eq('dial_id', dial.id);
      linked++;
    }
  }

  if (phone) {
    const { data: byPhone } = await service
      .from('acquisition_dials')
      .select('id, phone, lead_id')
      .eq('phone', phone)
      .or(`lead_id.is.null,lead_id.neq.${leadId}`);
    for (const dial of byPhone ?? []) {
      await service.from('acquisition_dials').update({ lead_id: leadId }).eq('id', dial.id);
      await service.from('acquisition_calls').update({ lead_id: leadId }).eq('dial_id', dial.id);
      linked++;
    }
  }

  return linked;
}


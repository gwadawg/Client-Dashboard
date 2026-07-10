/** Flatten PostgREST embeds for acquisition raw explorer rows. */

import { closeDisplayFromSnapshot } from '@/lib/acquisition-close-lifecycle';

type LeadEmbed = { lead_name: string | null; email: string | null; phone: string | null } | null;
type OfferEmbed = { offered_by: string | null; setter_name: string | null } | null;
type ClientEmbed = { name: string | null } | null;

export function flattenRawOfferRow(row: Record<string, unknown>): Record<string, unknown> {
  const lead = row.acquisition_leads as LeadEmbed;
  const { acquisition_leads: _l, ...rest } = row;
  return {
    ...rest,
    lead_name: lead?.lead_name ?? null,
    lead_email: lead?.email ?? null,
    lead_phone: lead?.phone ?? null,
  };
}

export function flattenRawCloseRow(row: Record<string, unknown>): Record<string, unknown> {
  const lead = row.acquisition_leads as LeadEmbed;
  const offer = row.acquisition_offers as OfferEmbed;
  const client = row.clients as ClientEmbed;
  const snapshot = closeDisplayFromSnapshot(row.raw as Record<string, unknown> | null | undefined);
  const { acquisition_leads: _l, acquisition_offers: _o, clients: _c, ...rest } = row;
  return {
    ...rest,
    lead_name: lead?.lead_name ?? snapshot.lead_name ?? null,
    lead_email: lead?.email ?? null,
    offered_by: offer?.offered_by ?? null,
    setter_name: (rest.setter_name as string | null) ?? offer?.setter_name ?? null,
    client_name: client?.name ?? snapshot.client_name ?? null,
  };
}

export const RAW_OFFER_SELECT =
  '*, acquisition_leads(lead_name, email, phone)';

export const RAW_CLOSE_SELECT =
  '*, acquisition_leads(lead_name, email, phone), acquisition_offers(offered_by, setter_name), clients(name)';

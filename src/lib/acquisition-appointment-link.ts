import type { SupabaseClient } from '@supabase/supabase-js';
import { upsertAcquisitionLead } from '@/lib/acquisition-ingest';
import {
  findCanonicalAcquisitionLead,
  linkOrphanDialsToLead,
} from '@/lib/acquisition-lead-resolve';
import {
  ghlContactName,
  getAcquisitionContact,
  ghlCustomFieldById,
  searchAcquisitionContacts,
} from '@/lib/ghl-acquisition-api';
import { GHL_CF } from '@/lib/acquisition-config';
import { normalizeAcquisitionLeadSource } from '@/lib/acquisition-lead-source';
import { normalizePhone } from '@/lib/acquisition-config';

type AppointmentRow = {
  id: string;
  lead_id: string | null;
  lead_name: string | null;
  phone: string | null;
  ghl_appointment_id: string | null;
};

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

async function getAppointment(
  service: SupabaseClient,
  appointmentId: string,
): Promise<AppointmentRow | null> {
  const { data } = await service
    .from('acquisition_appointments')
    .select('id, lead_id, lead_name, phone, ghl_appointment_id')
    .eq('id', appointmentId)
    .maybeSingle();
  return data;
}

export async function linkAcquisitionAppointmentToLead(
  service: SupabaseClient,
  appointmentId: string,
  leadId: string,
): Promise<{ ok: true; lead_id: string; ghl_contact_id: string | null } | { error: string }> {
  const appointment = await getAppointment(service, appointmentId);
  if (!appointment) return { error: 'Appointment not found' };

  const { data: lead, error: leadErr } = await service
    .from('acquisition_leads')
    .select('id, ghl_contact_id, phone')
    .eq('id', leadId)
    .maybeSingle();

  if (leadErr) return { error: leadErr.message };
  if (!lead) return { error: 'Lead not found' };

  const { error } = await service
    .from('acquisition_appointments')
    .update({ lead_id: leadId, updated_at: new Date().toISOString() })
    .eq('id', appointmentId);

  if (error) return { error: error.message };

  await service
    .from('acquisition_calls')
    .update({ lead_id: leadId })
    .eq('appointment_id', appointmentId);

  await linkOrphanDialsToLead(service, leadId, {
    ghl_contact_id: lead.ghl_contact_id,
    phone: lead.phone ?? appointment.phone,
  });

  return { ok: true, lead_id: leadId, ghl_contact_id: lead.ghl_contact_id };
}

export async function createLeadFromAppointment(
  service: SupabaseClient,
  appointmentId: string,
): Promise<{ ok: true; lead_id: string; ghl_contact_id: string | null } | { error: string }> {
  const appointment = await getAppointment(service, appointmentId);
  if (!appointment) return { error: 'Appointment not found' };
  if (appointment.lead_id) {
    const { data: existing } = await service
      .from('acquisition_leads')
      .select('id, ghl_contact_id')
      .eq('id', appointment.lead_id)
      .maybeSingle();
    if (existing) {
      return { ok: true, lead_id: existing.id, ghl_contact_id: existing.ghl_contact_id };
    }
  }

  const phone = normalizePhone(appointment.phone);
  const leadName = str(appointment.lead_name);
  if (!phone && !leadName) {
    return { error: 'Appointment has no phone or name to create a lead from' };
  }

  const canonical = await findCanonicalAcquisitionLead(service, { phone });
  if (canonical) {
    return linkAcquisitionAppointmentToLead(service, appointmentId, canonical.id);
  }

  const result = await upsertAcquisitionLead(service, {
    lead_name: leadName,
    phone,
    source: null,
    created_via: 'appointment_link_drawer',
    appointment_id: appointmentId,
  });

  if ('error' in result) return { error: result.error };
  if ('skipped' in result) {
    return { error: 'Could not create lead — contact looks like a dial-only scaffold' };
  }

  return linkAcquisitionAppointmentToLead(service, appointmentId, result.id);
}

export async function pullGhlAndLinkAppointment(
  service: SupabaseClient,
  appointmentId: string,
): Promise<
  | { ok: true; lead_id: string; ghl_contact_id: string; created: boolean }
  | { error: string }
> {
  const appointment = await getAppointment(service, appointmentId);
  if (!appointment) return { error: 'Appointment not found' };

  const phone = normalizePhone(appointment.phone);
  const name = str(appointment.lead_name);
  const queries = [phone, name].filter(Boolean) as string[];

  if (!queries.length) {
    return { error: 'Appointment has no phone or name to search GHL' };
  }

  let ghlContact: Awaited<ReturnType<typeof searchAcquisitionContacts>>[number] | null = null;

  for (const query of queries) {
    const matches = await searchAcquisitionContacts(query, 10);
    if (!matches.length) continue;

    if (phone) {
      const phone10 = phone.replace(/\D/g, '').slice(-10);
      const byPhone = matches.find(c => {
        const digits = (c.phone ?? '').replace(/\D/g, '').slice(-10);
        return digits && digits === phone10;
      });
      if (byPhone) {
        ghlContact = byPhone;
        break;
      }
    }

    if (!ghlContact && name) {
      const lower = name.toLowerCase();
      const byName = matches.find(c => ghlContactName(c)?.toLowerCase() === lower);
      if (byName) {
        ghlContact = byName;
        break;
      }
    }

    if (!ghlContact) ghlContact = matches[0];
    break;
  }

  if (!ghlContact?.id) {
    return { error: 'No matching contact found in GHL — try updating the contact in GHL first' };
  }

  let fullContact = ghlContact;
  try {
    fullContact = await getAcquisitionContact(ghlContact.id);
  } catch {
    // Use search result if detail fetch fails
  }

  const canonical = await findCanonicalAcquisitionLead(service, {
    ghl_contact_id: fullContact.id,
    phone: normalizePhone(fullContact.phone) ?? phone,
    email: str(fullContact.email),
  });

  let leadId: string;
  let created = false;

  if (canonical) {
    leadId = canonical.id;
    const source =
      normalizeAcquisitionLeadSource(str(fullContact.source)) ??
      normalizeAcquisitionLeadSource(ghlCustomFieldById(fullContact, GHL_CF.leadSource));
    await service
      .from('acquisition_leads')
      .update({
        ghl_contact_id: fullContact.id,
        lead_name: ghlContactName(fullContact) ?? canonical.lead_name ?? name,
        email: str(fullContact.email) ?? canonical.email,
        phone: normalizePhone(fullContact.phone) ?? canonical.phone,
        ...(source ? { source } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId);
  } else {
    const result = await upsertAcquisitionLead(service, {
      ghl_contact_id: fullContact.id,
      lead_name: ghlContactName(fullContact) ?? name,
      email: str(fullContact.email),
      phone: normalizePhone(fullContact.phone) ?? phone,
      source: str(fullContact.source),
      created_via: 'ghl_pull_appointment_drawer',
    });
    if ('error' in result) return { error: result.error };
    if ('skipped' in result) {
      return { error: 'GHL contact looks like a dial-only scaffold — add name/source in GHL first' };
    }
    leadId = result.id;
    created = true;
  }

  const linked = await linkAcquisitionAppointmentToLead(service, appointmentId, leadId);
  if ('error' in linked) return { error: linked.error };

  return {
    ok: true,
    lead_id: leadId,
    ghl_contact_id: fullContact.id!,
    created,
  };
}

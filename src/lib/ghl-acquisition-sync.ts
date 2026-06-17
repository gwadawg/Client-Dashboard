import type { SupabaseClient } from '@supabase/supabase-js';
import {
  GHL_CF,
  GHL_STAGE_DEMO_BOOKED,
} from './acquisition-config';
import type { DemoBookingCreditInput } from './acquisition-form-apply';
import {
  addAcquisitionContactNote,
  updateAcquisitionContactCustomFields,
  updateAcquisitionOpportunityStage,
} from './ghl-acquisition-api';

export type GhlSyncResult =
  | { status: 'synced' }
  | { status: 'failed'; error: string }
  | { status: 'skipped'; reason: string };

export async function syncDemoBookingToGhl(
  input: DemoBookingCreditInput,
): Promise<GhlSyncResult> {
  if (!process.env.GHL_ACQUISITION_API_TOKEN?.trim() && !process.env.GHL_API_TOKEN?.trim()) {
    return { status: 'skipped', reason: 'GHL_ACQUISITION_API_TOKEN not configured' };
  }

  const contactId = input.ghl_contact_id.trim();
  const fields: Array<{ id: string; value: string }> = [];

  if (input.setter_name?.trim()) {
    fields.push({ id: GHL_CF.agent, value: input.setter_name.trim() });
  }
  if (input.booking_source?.trim()) {
    fields.push({ id: GHL_CF.bookingSource, value: input.booking_source.trim() });
  }
  if (input.ghl_appointment_id?.trim()) {
    fields.push({ id: GHL_CF.appointmentId, value: input.ghl_appointment_id.trim() });
  }
  if (input.scheduled_at || input.booked_at) {
    const d = new Date(input.scheduled_at ?? input.booked_at);
    if (!Number.isNaN(d.getTime())) {
      fields.push({
        id: GHL_CF.dateApptBookedFor,
        value: d.toISOString().slice(0, 10),
      });
    }
  }
  if (input.qualified != null) {
    fields.push({
      id: GHL_CF.qualified,
      value: input.qualified ? 'Yes' : 'No',
    });
  }

  try {
    if (fields.length) {
      await updateAcquisitionContactCustomFields(contactId, fields);
    }

    try {
      await updateAcquisitionOpportunityStage(contactId, GHL_STAGE_DEMO_BOOKED);
    } catch (stageErr) {
      const msg = stageErr instanceof Error ? stageErr.message : String(stageErr);
      if (!msg.includes('Unknown GHL pipeline stage')) throw stageErr;
    }

    const noteLines = [
      '[Mr. Waiz] Demo booking credit logged',
      `Setter: ${input.setter_name}`,
      `Booking source: ${input.booking_source}`,
      `Booked: ${input.booked_at}`,
    ];
    if (input.notes?.trim()) noteLines.push(`Notes: ${input.notes.trim()}`);
    await addAcquisitionContactNote(contactId, noteLines.join('\n'));

    return { status: 'synced' };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return { status: 'failed', error };
  }
}

export async function recordGhlSyncOnSubmission(
  service: SupabaseClient,
  submissionId: string,
  result: GhlSyncResult,
): Promise<void> {
  const now = new Date().toISOString();
  if (result.status === 'synced') {
    await service
      .from('acquisition_form_submissions')
      .update({
        ghl_sync_status: 'synced',
        ghl_sync_error: null,
        ghl_synced_at: now,
      })
      .eq('id', submissionId);
    return;
  }

  if (result.status === 'skipped') {
    await service
      .from('acquisition_form_submissions')
      .update({
        ghl_sync_status: 'skipped',
        ghl_sync_error: result.reason,
        ghl_synced_at: null,
      })
      .eq('id', submissionId);
    return;
  }

  await service
    .from('acquisition_form_submissions')
    .update({
      ghl_sync_status: 'failed',
      ghl_sync_error: result.error,
      ghl_synced_at: null,
    })
    .eq('id', submissionId);
}

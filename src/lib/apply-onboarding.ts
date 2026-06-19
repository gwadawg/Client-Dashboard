import type { SupabaseClient } from '@supabase/supabase-js';
import { syncIsLiveWithLifecycle } from '@/lib/lifecycle-sync';
import {
  onboardingResponsesFromInput,
  onboardingToClientPatch,
  parseOnboardingFormFields,
  type OnboardingFormInput,
  type OnboardingMemberInput,
} from '@/lib/onboarding-form';
import {
  findClientsByContact,
  insertFormSubmission,
  type FormSubmissionRow,
} from '@/lib/form-submissions';
import { runOnboardingSideEffects, runOnboardingUnmappedNotification } from '@/lib/onboarding-side-effects';

const CLIENT_FIELDS =
  'id, name, lifecycle_status, email, phone, primary_contact_name, slack_id, clickup_task_id, ghl_contact_id';

export type OnboardingSubmitResult = {
  matched: boolean;
  client_id: string | null;
  submission_id: string;
  status: 'applied' | 'unmapped';
};

export async function applyOnboardingSubmission(
  service: SupabaseClient,
  input: OnboardingFormInput,
  rawBody: Record<string, unknown>,
): Promise<OnboardingSubmitResult> {
  const matches = await findClientsByContact(service, input.email, input.phone);
  const responses = { ...onboardingResponsesFromInput(input), ...rawBody };

  if (matches.length !== 1) {
    const submission = await insertFormSubmission(service, {
      client_id: null,
      form_type: 'onboarding',
      status: 'unmapped',
      submitted_by: 'client',
      match_email: input.email,
      match_phone: input.phone,
      responses,
    });

    void runOnboardingUnmappedNotification(service, input, {
      submission_id: submission.id,
      match_count: matches.length,
    });

    return {
      matched: false,
      client_id: null,
      submission_id: submission.id,
      status: 'unmapped',
    };
  }

  const client = matches[0];
  const patch = onboardingToClientPatch(input);
  const updates: Record<string, unknown> = { ...patch };

  const { data: existing } = await service
    .from('clients')
    .select('lifecycle_status')
    .eq('id', client.id)
    .single();

  if (existing?.lifecycle_status === 'new_account') {
    updates.lifecycle_status = 'onboarding';
    updates.is_live = syncIsLiveWithLifecycle('onboarding');
  }

  const { data: updated, error } = await service
    .from('clients')
    .update(updates)
    .eq('id', client.id)
    .select(CLIENT_FIELDS)
    .single();
  if (error) throw new Error(error.message);

  await insertOnboardingContacts(service, client.id, input.additional_members);

  const submission = await insertFormSubmission(service, {
    client_id: client.id,
    form_type: 'onboarding',
    status: 'applied',
    submitted_by: 'client',
    match_email: input.email,
    match_phone: input.phone,
    responses,
    applied_patch: patch,
  });

  void runOnboardingSideEffects(
    {
      id: updated.id,
      name: updated.name,
      clickup_task_id: updated.clickup_task_id ?? null,
      ghl_contact_id: updated.ghl_contact_id ?? null,
    },
    input,
    service,
  );

  return {
    matched: true,
    client_id: client.id,
    submission_id: submission.id,
    status: 'applied',
  };
}

export async function applyPendingOnboardingToClient(
  service: SupabaseClient,
  submissionId: string,
  clientId: string,
  submittedBy: string | null,
): Promise<FormSubmissionRow> {
  const { data: row, error } = await service
    .from('client_form_submissions')
    .select('*')
    .eq('id', submissionId)
    .eq('form_type', 'onboarding')
    .single();
  if (error || !row) throw new Error('Submission not found');

  const responses = (row.responses ?? {}) as Record<string, unknown>;
  const input = parseOnboardingFormFields(responses);
  const patch = onboardingToClientPatch(input);
  const updates: Record<string, unknown> = { ...patch };

  const { data: existing } = await service
    .from('clients')
    .select('lifecycle_status')
    .eq('id', clientId)
    .single();

  if (existing?.lifecycle_status === 'new_account') {
    updates.lifecycle_status = 'onboarding';
    updates.is_live = syncIsLiveWithLifecycle('onboarding');
  }

  const { error: upErr } = await service.from('clients').update(updates).eq('id', clientId);
  if (upErr) throw new Error(upErr.message);

  await insertOnboardingContacts(service, clientId, input.additional_members);

  const { data: updatedSub, error: subErr } = await service
    .from('client_form_submissions')
    .update({
      client_id: clientId,
      status: 'applied',
      applied_patch: patch,
      submitted_by: submittedBy ?? row.submitted_by,
    })
    .eq('id', submissionId)
    .select('*')
    .single();
  if (subErr) throw new Error(subErr.message);

  const { data: client } = await service
    .from('clients')
    .select(CLIENT_FIELDS)
    .eq('id', clientId)
    .single();

  if (client) {
    void runOnboardingSideEffects(
      {
        id: clientId,
        name: client.name,
        clickup_task_id: client.clickup_task_id ?? null,
        ghl_contact_id: client.ghl_contact_id ?? null,
      },
      input,
      service,
    );
  }

  return updatedSub as FormSubmissionRow;
}

export async function insertOnboardingContacts(
  service: SupabaseClient,
  clientId: string,
  members: OnboardingMemberInput[],
): Promise<void> {
  if (!members.length) return;

  const rows = members.map((member, index) => ({
    client_id: clientId,
    contact_type: member.contact_type,
    name: member.name,
    email: member.email,
    phone: member.phone,
    nmls: member.nmls,
    states_licensed: member.states_licensed,
    notes: null,
    sort_order: index,
  }));

  const { error } = await service.from('client_contacts').insert(rows);
  if (error) throw new Error(error.message);
}

export async function uploadClientHeadshot(
  service: SupabaseClient,
  file: File,
): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const allowed = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);
  if (!allowed.has(ext)) throw new Error('Headshot must be JPG, PNG, WEBP, or GIF');

  const path = `${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await service.storage.from('client-headshots').upload(path, buffer, {
    contentType: file.type || 'image/jpeg',
    upsert: false,
  });
  if (error) throw new Error(error.message);

  const { data } = service.storage.from('client-headshots').getPublicUrl(path);
  return data.publicUrl;
}

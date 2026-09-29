// Free-text from client forms that has no clients column. Written to client_notes
// so the client file keeps it. One note per marker; later saves update that note.

import type { SupabaseClient } from '@supabase/supabase-js';

export type ClientFormNoteSection = {
  label: string;
  value: string | null | undefined;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function formatMarkedClientNote(
  marker: string,
  sections: ClientFormNoteSection[],
): string | null {
  const filled = sections
    .map(section => ({
      label: section.label.trim(),
      value: (section.value ?? '').trim(),
    }))
    .filter(section => section.label && section.value);
  if (!filled.length) return null;
  return [marker, ...filled.map(section => `${section.label}\n${section.value}`)].join('\n\n');
}

function authorId(createdBy: string | null | undefined): string | null {
  if (!createdBy || !UUID_RE.test(createdBy)) return null;
  return createdBy;
}

/**
 * Insert or replace the note whose body starts with `marker`.
 * An empty body soft-deletes that note so a cleared form does not leave stale text.
 */
export async function saveMarkedClientNote(
  service: SupabaseClient,
  clientId: string,
  marker: string,
  body: string | null,
  createdBy?: string | null,
  options?: { insertOnly?: boolean },
): Promise<void> {
  const trimmedMarker = marker.trim();
  if (!trimmedMarker) return;

  const { data: existing, error: lookupError } = await service
    .from('client_notes')
    .select('id, body')
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .like('body', `${trimmedMarker}%`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    console.error('[client-form-notes] lookup failed', trimmedMarker, lookupError.message);
    return;
  }

  const now = new Date().toISOString();
  const userId = authorId(createdBy);
  const nextBody = body?.trim() || null;

  if (options?.insertOnly) {
    if (existing?.id || !nextBody) return;
  }

  if (!nextBody) {
    if (!existing?.id) return;
    const { error } = await service
      .from('client_notes')
      .update({
        deleted_at: now,
        updated_at: now,
        ...(userId ? { updated_by: userId } : {}),
      })
      .eq('id', existing.id);
    if (error) console.error('[client-form-notes] clear failed', trimmedMarker, error.message);
    return;
  }

  if (existing?.id) {
    if (existing.body === nextBody) return;
    const { error } = await service
      .from('client_notes')
      .update({
        body: nextBody,
        updated_at: now,
        ...(userId ? { updated_by: userId } : {}),
      })
      .eq('id', existing.id);
    if (error) console.error('[client-form-notes] update failed', trimmedMarker, error.message);
    return;
  }

  const { error } = await service.from('client_notes').insert({
    client_id: clientId,
    note_type: 'internal',
    body: nextBody,
    ...(userId ? { created_by: userId } : {}),
  });
  if (error) console.error('[client-form-notes] insert failed', trimmedMarker, error.message);
}

export async function recordClientFormNote(
  service: SupabaseClient,
  clientId: string,
  marker: string,
  sections: ClientFormNoteSection[],
  createdBy?: string | null,
): Promise<void> {
  try {
    await saveMarkedClientNote(
      service,
      clientId,
      marker,
      formatMarkedClientNote(marker, sections),
      createdBy,
    );
  } catch (e) {
    console.error('[client-form-notes] save failed', marker, e);
  }
}

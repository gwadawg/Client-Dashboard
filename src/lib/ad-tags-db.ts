import { normalizeTagSlugs, slugifyAdTag, type AdTag, type AdTagRef } from './ad-tags';
import type { createServiceClient } from './supabase';

type ServiceClient = ReturnType<typeof createServiceClient>;

export const AD_TAG_SELECT = 'id, slug, label, sort_order, is_active, created_at';

function cleanString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s || null;
}

export async function listAdTags(service: ServiceClient): Promise<{
  data: AdTag[] | null;
  error: { message: string } | null;
}> {
  const { data, error } = await service
    .from('ad_tags')
    .select(AD_TAG_SELECT)
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true });
  return { data: (data as AdTag[] | null) ?? null, error };
}

export async function adTagSlugExists(service: ServiceClient, slug: string): Promise<boolean> {
  const { data } = await service.from('ad_tags').select('slug').eq('slug', slug).maybeSingle();
  return !!data?.slug;
}

export async function resolveTagSlugs(
  service: ServiceClient,
  value: unknown,
): Promise<{ slugs: string[]; error?: string }> {
  const parsed = normalizeTagSlugs(value);
  if (parsed.error) return parsed;
  if (parsed.slugs.length === 0) return { slugs: [] };

  const { data, error } = await service
    .from('ad_tags')
    .select('slug')
    .in('slug', parsed.slugs)
    .eq('is_active', true);
  if (error) return { slugs: [], error: error.message };

  const found = new Set((data ?? []).map((r) => r.slug as string));
  const missing = parsed.slugs.filter((s) => !found.has(s));
  if (missing.length) {
    return { slugs: [], error: `Unknown tag: ${missing[0]}. Add it from the tag picker first.` };
  }
  return { slugs: parsed.slugs.filter((s) => found.has(s)) };
}

export async function replaceLibraryTags(
  service: ServiceClient,
  libraryId: string,
  slugs: string[],
): Promise<{ error?: string }> {
  const { error: delError } = await service.from('ad_library_tags').delete().eq('library_id', libraryId);
  if (delError) return { error: delError.message };
  if (slugs.length === 0) return {};
  const { error: insError } = await service
    .from('ad_library_tags')
    .insert(slugs.map((tag_slug) => ({ library_id: libraryId, tag_slug })));
  if (insError) return { error: insError.message };
  return {};
}

export async function tagsByLibraryId(
  service: ServiceClient,
  libraryIds: string[],
): Promise<{ data: Map<string, AdTagRef[]>; error?: string }> {
  const map = new Map<string, AdTagRef[]>();
  if (libraryIds.length === 0) return { data: map };

  const [{ data: junctions, error: jErr }, { data: catalog, error: cErr }] = await Promise.all([
    service.from('ad_library_tags').select('library_id, tag_slug').in('library_id', libraryIds),
    listAdTags(service),
  ]);
  if (jErr) return { data: map, error: jErr.message };
  if (cErr) return { data: map, error: cErr.message };

  const labels = new Map((catalog ?? []).map((t) => [t.slug, t.label]));
  for (const row of junctions ?? []) {
    const list = map.get(row.library_id) ?? [];
    list.push({ slug: row.tag_slug, label: labels.get(row.tag_slug) ?? row.tag_slug });
    map.set(row.library_id, list);
  }
  return { data: map };
}

export async function withLibraryTags<T extends { id: string }>(
  service: ServiceClient,
  rows: T[],
): Promise<{ data: (T & { tags: AdTagRef[] })[]; error?: string }> {
  const { data: map, error } = await tagsByLibraryId(
    service,
    rows.map((r) => r.id),
  );
  const data = rows.map((row) => ({ ...row, tags: map.get(row.id) ?? [] }));
  return error ? { data, error } : { data };
}

async function uniqueSlug(service: ServiceClient, label: string): Promise<string> {
  const base = slugifyAdTag(label);
  const { data } = await service.from('ad_tags').select('slug').like('slug', `${base}%`);
  const taken = new Set((data ?? []).map((r) => r.slug as string));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export async function createAdTag(
  service: ServiceClient,
  labelRaw: unknown,
): Promise<{ data: AdTag | null; status: number; error?: string }> {
  const label = cleanString(labelRaw);
  if (!label) return { data: null, status: 400, error: 'label is required' };
  if (label.length > 40) return { data: null, status: 400, error: 'label must be 40 characters or fewer' };

  const { data: maxRow } = await service
    .from('ad_tags')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const sort_order = (typeof maxRow?.sort_order === 'number' ? maxRow.sort_order : 0) + 10;
  const slug = await uniqueSlug(service, label);

  const { data, error } = await service
    .from('ad_tags')
    .insert({ slug, label, sort_order })
    .select(AD_TAG_SELECT)
    .maybeSingle();

  if (error) {
    if (error.code === '23505') {
      return { data: null, status: 409, error: 'A tag with that name already exists.' };
    }
    return { data: null, status: 500, error: error.message };
  }
  return { data: data as AdTag, status: 201 };
}

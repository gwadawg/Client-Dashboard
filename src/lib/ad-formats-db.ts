import { slugifyAdFormat, type AdFormat } from './ad-formats';
import type { createServiceClient } from './supabase';

type ServiceClient = ReturnType<typeof createServiceClient>;

export const AD_FORMAT_SELECT = 'id, slug, label, sort_order, is_active, created_at';

function cleanString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s || null;
}

export async function listAdFormats(service: ServiceClient): Promise<{
  data: AdFormat[] | null;
  error: { message: string } | null;
}> {
  const { data, error } = await service
    .from('ad_formats')
    .select(AD_FORMAT_SELECT)
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true });
  return { data: (data as AdFormat[] | null) ?? null, error };
}

export async function findActiveAdFormatSlug(
  service: ServiceClient,
  slug: string,
): Promise<string | null> {
  const { data } = await service
    .from('ad_formats')
    .select('slug')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();
  return data?.slug ?? null;
}

export async function adFormatSlugExists(
  service: ServiceClient,
  slug: string,
): Promise<boolean> {
  const { data } = await service
    .from('ad_formats')
    .select('slug')
    .eq('slug', slug)
    .maybeSingle();
  return !!data?.slug;
}

/** Validate a library write against the live catalog. Empty → null. */
export async function resolveAdFormatSlug(
  service: ServiceClient,
  value: unknown,
): Promise<{ slug: string | null; error?: string }> {
  if (value == null || value === '') return { slug: null };
  const s = cleanString(value);
  if (!s) return { slug: null };
  const found = await findActiveAdFormatSlug(service, s);
  if (!found) {
    return { slug: null, error: 'Unknown ad_format. Add it from the Ad format picker first.' };
  }
  return { slug: found };
}

async function uniqueSlug(service: ServiceClient, label: string): Promise<string> {
  const base = slugifyAdFormat(label);
  const { data } = await service
    .from('ad_formats')
    .select('slug')
    .like('slug', `${base}%`);
  const taken = new Set((data ?? []).map((r) => r.slug as string));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export async function createAdFormat(
  service: ServiceClient,
  labelRaw: unknown,
): Promise<{ data: AdFormat | null; status: number; error?: string }> {
  const label = cleanString(labelRaw);
  if (!label) return { data: null, status: 400, error: 'label is required' };
  if (label.length > 40) return { data: null, status: 400, error: 'label must be 40 characters or fewer' };

  const { data: maxRow } = await service
    .from('ad_formats')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const sort_order = (typeof maxRow?.sort_order === 'number' ? maxRow.sort_order : 0) + 10;
  const slug = await uniqueSlug(service, label);

  const { data, error } = await service
    .from('ad_formats')
    .insert({ slug, label, sort_order })
    .select(AD_FORMAT_SELECT)
    .maybeSingle();

  if (error) {
    if (error.code === '23505') {
      return { data: null, status: 409, error: 'A format with that name already exists.' };
    }
    return { data: null, status: 500, error: error.message };
  }
  return { data: data as AdFormat, status: 201 };
}

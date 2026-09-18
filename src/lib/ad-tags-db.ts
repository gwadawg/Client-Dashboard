import { normalizeTagIds, enforceCategorySelectionRules } from './ad-tags-resolve';
import { isAdTagProduct, type AdTagProduct } from './ad-tag-categories';
import { slugifyAdTag, type AdTag, type AdTagRef } from './ad-tags';
import type { createServiceClient } from './supabase';

type ServiceClient = ReturnType<typeof createServiceClient>;

export const AD_TAG_SELECT =
  'id, slug, label, product, category, sort_order, is_active, created_at';

function cleanString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s || null;
}

export async function listAdTags(
  service: ServiceClient,
  product?: AdTagProduct | null,
): Promise<{ data: AdTag[] | null; error: { message: string } | null }> {
  let q = service
    .from('ad_tags')
    .select(AD_TAG_SELECT)
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true });
  if (product) q = q.eq('product', product);
  const { data, error } = await q;
  return { data: (data as AdTag[] | null) ?? null, error };
}

export async function adTagIdExists(service: ServiceClient, id: string): Promise<boolean> {
  const { data } = await service.from('ad_tags').select('id').eq('id', id).maybeSingle();
  return !!data?.id;
}

export async function resolveTagIds(
  service: ServiceClient,
  value: unknown,
  product: AdTagProduct | null,
): Promise<{ ids: string[]; error?: string }> {
  const parsed = normalizeTagIds(value);
  if (parsed.error) return parsed;
  if (parsed.ids.length === 0) return { ids: [] };
  if (!product) return { ids: [], error: 'product is required before attaching tags' };

  const { data, error } = await service
    .from('ad_tags')
    .select('id, product, category, slug')
    .in('id', parsed.ids)
    .eq('is_active', true);
  if (error) return { ids: [], error: error.message };

  const found = new Map(
    (data ?? []).map((r) => [
      r.id as string,
      {
        product: r.product as string,
        category: r.category as string,
        slug: r.slug as string,
      },
    ]),
  );
  for (const id of parsed.ids) {
    const row = found.get(id);
    if (!row) return { ids: [], error: `Unknown tag id: ${id}` };
    if (row.product !== product) {
      return { ids: [], error: `Tag ${id} does not belong to product ${product}` };
    }
  }

  const refs = parsed.ids.map((id) => {
    const row = found.get(id)!;
    return { id, category: row.category, slug: row.slug };
  });
  const rules = enforceCategorySelectionRules(product, refs);
  if (rules.error) return { ids: [], error: rules.error };

  return { ids: parsed.ids };
}

export async function replaceLibraryTags(
  service: ServiceClient,
  libraryId: string,
  tagIds: string[],
): Promise<{ error?: string }> {
  const { error: delError } = await service
    .from('ad_library_tags')
    .delete()
    .eq('library_id', libraryId);
  if (delError) return { error: delError.message };
  if (tagIds.length === 0) return {};
  const { error: insError } = await service
    .from('ad_library_tags')
    .insert(tagIds.map((tag_id) => ({ library_id: libraryId, tag_id })));
  if (insError) return { error: insError.message };
  return {};
}

export async function tagsByLibraryId(
  service: ServiceClient,
  libraryIds: string[],
): Promise<{ data: Map<string, AdTagRef[]>; error?: string }> {
  const map = new Map<string, AdTagRef[]>();
  if (libraryIds.length === 0) return { data: map };

  const { data: junctions, error: jErr } = await service
    .from('ad_library_tags')
    .select('library_id, tag_id')
    .in('library_id', libraryIds);
  if (jErr) return { data: map, error: jErr.message };

  const tagIds = [...new Set((junctions ?? []).map((r) => r.tag_id as string))];
  if (tagIds.length === 0) return { data: map };

  const { data: catalog, error: cErr } = await service
    .from('ad_tags')
    .select(AD_TAG_SELECT)
    .in('id', tagIds);
  if (cErr) return { data: map, error: cErr.message };

  const byId = new Map((catalog ?? []).map((t) => [t.id as string, t as AdTag]));
  for (const row of junctions ?? []) {
    const tag = byId.get(row.tag_id as string);
    if (!tag) continue;
    const list = map.get(row.library_id as string) ?? [];
    list.push({
      id: tag.id,
      slug: tag.slug,
      label: tag.label,
      product: tag.product,
      category: tag.category,
    });
    map.set(row.library_id as string, list);
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

async function uniqueSlug(
  service: ServiceClient,
  product: AdTagProduct,
  category: string,
  label: string,
): Promise<string> {
  const base = slugifyAdTag(label);
  const { data } = await service
    .from('ad_tags')
    .select('slug')
    .eq('product', product)
    .eq('category', category)
    .like('slug', `${base}%`);
  const taken = new Set((data ?? []).map((r) => r.slug as string));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export async function createAdTag(
  service: ServiceClient,
  input: { label: unknown; product: unknown; category: unknown },
): Promise<{ data: AdTag | null; status: number; error?: string }> {
  const label = cleanString(input.label);
  const productRaw = cleanString(input.product);
  const category = cleanString(input.category)?.toLowerCase().replace(/-/g, '_') ?? null;

  if (!label) return { data: null, status: 400, error: 'label is required' };
  if (label.length > 40) return { data: null, status: 400, error: 'label must be 40 characters or fewer' };
  if (!productRaw || !isAdTagProduct(productRaw)) {
    return { data: null, status: 400, error: 'product must be dscr, reverse, or broad_forward' };
  }
  if (!category || !/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(category)) {
    return { data: null, status: 400, error: 'category is required' };
  }

  const { data: maxRow } = await service
    .from('ad_tags')
    .select('sort_order')
    .eq('product', productRaw)
    .eq('category', category)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const sort_order = (typeof maxRow?.sort_order === 'number' ? maxRow.sort_order : 0) + 10;
  const slug = await uniqueSlug(service, productRaw, category, label);

  const { data, error } = await service
    .from('ad_tags')
    .insert({ slug, label, product: productRaw, category, sort_order })
    .select(AD_TAG_SELECT)
    .maybeSingle();

  if (error) {
    if (error.code === '23505') {
      return { data: null, status: 409, error: 'A tag with that name already exists in this category.' };
    }
    return { data: null, status: 500, error: error.message };
  }
  return { data: data as AdTag, status: 201 };
}

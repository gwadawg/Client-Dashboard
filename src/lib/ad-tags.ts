import type { AdTagProduct } from './ad-tag-categories';

export type AdTag = {
  id: string;
  slug: string;
  label: string;
  product: AdTagProduct;
  category: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

export type AdTagRef = {
  id: string;
  slug: string;
  label: string;
  product: AdTagProduct;
  category: string;
};

export function slugifyAdTag(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base || 'tag';
}

export function adTagLabelMap(tags: Pick<AdTag, 'slug' | 'label'>[]): Record<string, string> {
  return Object.fromEntries(tags.map((t) => [t.slug, t.label]));
}

/** @deprecated Prefer normalizeTagIds — library writes use tag ids. */
export function normalizeTagSlugs(value: unknown): { slugs: string[]; error?: string } {
  if (value == null) return { slugs: [] };
  if (!Array.isArray(value)) return { slugs: [], error: 'tags must be an array of slugs' };
  const slugs: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') return { slugs: [], error: 'tags must be an array of slugs' };
    const slug = item.trim().toLowerCase();
    if (!slug) continue;
    if (!slugs.includes(slug)) slugs.push(slug);
  }
  return { slugs };
}

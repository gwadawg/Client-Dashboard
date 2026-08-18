export type AdFormat = {
  id: string;
  slug: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

export function slugifyAdFormat(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base || 'format';
}

export function adFormatLabelMap(formats: Pick<AdFormat, 'slug' | 'label'>[]): Record<string, string> {
  return Object.fromEntries(formats.map((f) => [f.slug, f.label]));
}

export function adFormatLabel(
  slug: string | null | undefined,
  labels: Record<string, string>,
): string {
  if (!slug) return '';
  return labels[slug] ?? slug;
}

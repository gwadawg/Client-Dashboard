export const TRANSACTION_TYPES = [
  { slug: 'heloc', label: 'HELOC' },
  { slug: 'dscr', label: 'DSCR' },
  { slug: 'reverse', label: 'Reverse' },
  { slug: 'traditional_forward', label: 'Traditional Forward' },
  { slug: 'other', label: 'Other' },
] as const;

export type TransactionTypeSlug = (typeof TRANSACTION_TYPES)[number]['slug'];

const SLUG_SET = new Set<string>(TRANSACTION_TYPES.map(t => t.slug));
const LABEL_BY_SLUG = new Map(TRANSACTION_TYPES.map(t => [t.slug, t.label]));

export function transactionTypeLabel(slug: TransactionTypeSlug): string {
  return LABEL_BY_SLUG.get(slug) ?? slug;
}

export function isTransactionTypeSlug(value: string): value is TransactionTypeSlug {
  return SLUG_SET.has(value);
}

export function formatTransactionLabel(
  slug: TransactionTypeSlug | '',
  other: string | null,
): string | null {
  if (!slug) return null;
  if (slug === 'other') {
    const trimmed = other?.trim();
    if (!trimmed) return null;
    return `Other: ${trimmed}`;
  }
  return transactionTypeLabel(slug);
}

export function parseTransactionLabel(value: string | null | undefined): {
  slug: TransactionTypeSlug | '';
  other: string;
} {
  if (!value?.trim()) return { slug: '', other: '' };
  const trimmed = value.trim();

  for (const type of TRANSACTION_TYPES) {
    if (type.slug === 'other') continue;
    if (trimmed.toLowerCase() === type.label.toLowerCase()) {
      return { slug: type.slug, other: '' };
    }
  }

  if (trimmed.toLowerCase().startsWith('other:')) {
    return { slug: 'other', other: trimmed.slice(6).trim() };
  }

  return { slug: 'other', other: trimmed };
}

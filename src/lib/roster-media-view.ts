import { formatStatesLicensed } from '@/lib/us-states';

export function compactLicensedStates(
  codes: string[] | null | undefined,
  maxVisible = 4,
): { text: string; title: string | undefined; muted: boolean } {
  if (!codes?.length) return { text: '—', title: undefined, muted: true };
  const title = formatStatesLicensed(codes);
  if (codes.length <= maxVisible) {
    return { text: codes.join(' · '), title, muted: false };
  }
  const shown = codes.slice(0, maxVisible);
  const extra = codes.length - maxVisible;
  return {
    text: `${shown.join(' · ')} +${extra}`,
    title,
    muted: false,
  };
}

export function countSecondaryRosterFilters(filters: {
  offer: string;
  package: string;
  ads: string;
}): number {
  let n = 0;
  if (filters.offer !== 'all') n += 1;
  if (filters.package !== 'all') n += 1;
  if (filters.ads !== 'all') n += 1;
  return n;
}

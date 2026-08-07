/** spoken ÷ total leads → rate as 0–100 percentage. */
export function computeContactRatePct(
  totalLeads: number,
  spokenTo: number,
): number | null {
  if (!Number.isFinite(totalLeads) || !Number.isFinite(spokenTo)) return null;
  if (totalLeads <= 0) return null;
  if (spokenTo < 0) return null;
  const pct = (spokenTo / totalLeads) * 100;
  return Math.min(100, Math.max(0, pct));
}

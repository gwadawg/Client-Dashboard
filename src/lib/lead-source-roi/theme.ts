/**
 * Financial-terminal tokens for the lead source ROI tool.
 * Sharp rules, hairline borders, one amber accent. Their side reads flat and
 * grey; the Waiz side is the only lit surface on the page.
 */

export const T = {
  base: "#060B14",
  panel: "#0A1220",
  raised: "#0E1829",
  input: "#0B1526",

  rule: "rgba(148,163,184,0.13)",
  ruleSoft: "rgba(148,163,184,0.07)",
  ruleStrong: "rgba(148,163,184,0.26)",

  hi: "#E8EEF7",
  mid: "#94A3B8",
  low: "#5A6B84",

  amber: "#F5A524",
  amberSoft: "rgba(245,165,36,0.10)",
  amberLine: "rgba(245,165,36,0.34)",

  good: "#34D399",
  goodSoft: "rgba(52,211,153,0.09)",
  goodLine: "rgba(52,211,153,0.30)",
  bad: "#F87171",
} as const;

export const BORDER = `1px solid ${T.rule}`;
/** Terminal, not app-store — corners stay tight. */
export const R = 4;

/** Panel chrome for a side column. Only the Waiz side gets lit. */
export function sidePanel(isWaiz: boolean) {
  return isWaiz
    ? {
        background: `linear-gradient(180deg, rgba(245,165,36,0.055), ${T.panel} 42%)`,
        border: `1px solid ${T.amberLine}`,
      }
    : { background: T.panel, border: BORDER };
}

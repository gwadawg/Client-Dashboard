import type { VirtualCardProduct } from "./types";
import rmPacksJson from "./packs/rm-packs.json";
import dscrPacksJson from "./packs/dscr-packs.json";

export type StylePackColors = {
  paper: string;
  paper_deep: string;
  ink: string;
  ink_soft: string;
  muted: string;
  faint: string;
  line: string;
  accent: string;
  accent_deep: string;
  accent_wash: string;
  on_accent: string;
  surface?: string;
  shadow?: string;
};

export type StylePackFonts = {
  display: string;
  body: string;
  google: string;
  mono?: string;
};

export type StylePack = {
  pack_id: string;
  display_name: string;
  mood: string;
  best_default_for: string;
  light_or_dark: "light" | "dark";
  colors: StylePackColors;
  fonts: StylePackFonts;
  sample_value_line: string;
  style?: Record<string, string | number>;
};

type PacksFile = {
  product: string;
  packs: StylePack[];
};

const RM_PACKS = (rmPacksJson as PacksFile).packs;
const DSCR_PACKS = (dscrPacksJson as PacksFile).packs;

export function listStylePacks(product: VirtualCardProduct): StylePack[] {
  return product === "dscr" ? DSCR_PACKS : RM_PACKS;
}

export function getStylePack(
  product: VirtualCardProduct,
  packId: string | null | undefined,
): StylePack {
  const packs = listStylePacks(product);
  const found = packs.find(p => p.pack_id === packId);
  if (found) return found;
  return packs[0]!;
}

export function defaultStylePackId(product: VirtualCardProduct): string {
  const packs = listStylePacks(product);
  const preferred = packs.find(p => p.best_default_for === product || p.best_default_for === "either");
  return (preferred ?? packs[0]!).pack_id;
}

/** CSS custom properties for a pack (card + educate). */
export function packCssVars(pack: StylePack): Record<string, string> {
  const c = pack.colors;
  const dark = pack.light_or_dark === "dark";
  // Solid paper lifts only — translucent white on dark packs paints grey slabs.
  const surface = c.surface ?? (dark ? c.paper_deep : "#ffffff");
  const shadow =
    c.shadow ??
    (dark ? "0 18px 40px -28px rgba(0,0,0,0.75)" : "0 14px 34px -24px rgba(0,0,0,0.22)");

  return {
    "--vc-paper": c.paper,
    "--vc-paper-deep": c.paper_deep,
    "--vc-ink": c.ink,
    "--vc-ink-soft": c.ink_soft,
    "--vc-muted": c.muted,
    "--vc-faint": c.faint,
    "--vc-line": c.line,
    "--vc-accent": c.accent,
    "--vc-accent-deep": c.accent_deep,
    "--vc-accent-wash": c.accent_wash,
    "--vc-on-accent": c.on_accent,
    "--vc-surface": surface,
    "--vc-shadow": shadow,
    "--vc-display": `"${pack.fonts.display}", system-ui, sans-serif`,
    "--vc-body": `"${pack.fonts.body}", system-ui, sans-serif`,
    "--vc-radius": String(pack.style?.radius ?? "14px"),
  };
}

export function googleFontsHref(pack: StylePack): string {
  return `https://fonts.googleapis.com/css2?family=${pack.fonts.google}&display=swap`;
}

/** Waiz Media brand tokens — from acquisition proposal templates. */
export const WAIZ = {
  navy: "#061A4A",
  royal: "#0E2F73",
  accent: "#4FA3FF",
  green: "#7CFF7A",
  gold: "#F5C842",
  white: "#FFFFFF",
  light: "#F5F7FB",
  dark: "#0B1220",
  mid: "#6B7280",
  divider: "#D1D9F0",
  brandName: "Waiz Media",
} as const;

export type WaizToken = (typeof WAIZ)[keyof typeof WAIZ];

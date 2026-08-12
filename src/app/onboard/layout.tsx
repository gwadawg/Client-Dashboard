import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Waiz Media — Client Onboarding",
  description: "Get set up with your Waiz Media acquisition engine.",
};

export default function OnboardLayout({ children }: { children: React.ReactNode }) {
  // Faces come from src/styles/fonts.css (--ob-display / --ob-body).
  return <div style={{ fontFamily: "var(--ob-body)" }}>{children}</div>;
}

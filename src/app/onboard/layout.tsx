import type { Metadata } from "next";
import { DM_Sans, Sora } from "next/font/google";

const sora = Sora({
  variable: "--ob-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const dmSans = DM_Sans({
  variable: "--ob-body",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Waiz Media — Client Onboarding",
  description: "Get set up with your Waiz Media acquisition engine.",
};

export default function OnboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${sora.variable} ${dmSans.variable}`}
      style={{ fontFamily: "var(--ob-body)" }}
    >
      {children}
    </div>
  );
}

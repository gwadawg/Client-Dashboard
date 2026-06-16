import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Team Forms — Mr. Waiz",
  description: "Internal forms for client success and operations.",
};

export default function FormsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: "#060d1a", color: "#e2e8f0" }}>
      <header
        className="sticky top-0 z-10 px-4 py-3 flex items-center justify-between gap-4"
        style={{ background: "#0a1628", borderBottom: "1px solid rgba(255,255,255,0.08)" }}
      >
        <Link href="/forms" className="text-sm font-semibold text-slate-300 hover:text-white">
          Team Forms
        </Link>
        <Link
          href="/dashboard"
          className="text-xs font-medium text-slate-500 hover:text-slate-300"
        >
          Back to dashboard
        </Link>
      </header>
      <main className="px-4 py-8">{children}</main>
    </div>
  );
}

"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import LeadSourceRoiCalculator from "@/components/LeadSourceRoiCalculator";
import { TOOL_TITLE } from "@/lib/lead-source-roi/config";

function CalculatorFromQuery() {
  const searchParams = useSearchParams();
  const encoded = searchParams.get("s");
  return (
    <LeadSourceRoiCalculator variant="public" initialEncoded={encoded} />
  );
}

export default function LeadSourceRoiPublicPage() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#080f1e" }}>
      <header
        className="px-4 py-3 flex items-center justify-between"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div>
          <p
            className="text-xs uppercase tracking-wide"
            style={{ color: "#64748b" }}
          >
            Waiz Media
          </p>
          <h1 className="text-lg font-semibold" style={{ color: "#e2e8f0" }}>
            {TOOL_TITLE}
          </h1>
        </div>
      </header>
      <Suspense
        fallback={
          <p className="p-6 text-sm" style={{ color: "#94a3b8" }}>
            Loading calculator…
          </p>
        }
      >
        <CalculatorFromQuery />
      </Suspense>
    </div>
  );
}

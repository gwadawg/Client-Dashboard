"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import LeadSourceRoiCalculator from "@/components/LeadSourceRoiCalculator";
import { TOOL_TITLE } from "@/lib/lead-source-roi/config";
import { T } from "@/lib/lead-source-roi/theme";

function CalculatorFromQuery() {
  const searchParams = useSearchParams();
  const encoded = searchParams.get("s");
  return <LeadSourceRoiCalculator variant="public" initialEncoded={encoded} />;
}

export default function LeadSourceRoiPublicPage() {
  return (
    <div className="lsr min-h-screen flex flex-col" style={{ background: T.base }}>
      <header
        className="px-4 md:px-6 py-3 flex items-center gap-3"
        style={{ borderBottom: `1px solid ${T.rule}` }}
      >
        <span
          className="block w-1.5 h-6"
          style={{ background: T.amber, borderRadius: 1 }}
          aria-hidden
        />
        <div>
          <p
            className="text-[10px] font-semibold uppercase"
            style={{ color: T.low, letterSpacing: "0.16em" }}
          >
            Waiz Media
          </p>
          <h1
            className="text-[15px] font-bold leading-tight"
            style={{ color: T.hi, letterSpacing: "-0.01em" }}
          >
            {TOOL_TITLE}
          </h1>
        </div>
      </header>
      <Suspense
        fallback={
          <p className="p-6 text-sm" style={{ color: T.mid }}>
            Loading calculator…
          </p>
        }
      >
        <CalculatorFromQuery />
      </Suspense>
    </div>
  );
}

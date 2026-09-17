import { Suspense } from "react";
import ReinstateFormRouteClient from "./ReinstateFormRouteClient";

export default function ReinstateFormRoutePage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500 text-center py-12">Loading form…</p>}>
      <ReinstateFormRouteClient />
    </Suspense>
  );
}

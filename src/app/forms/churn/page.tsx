import { Suspense } from "react";
import ChurnFormRouteClient from "./ChurnFormRouteClient";

export default function ChurnFormRoutePage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500 text-center py-12">Loading form…</p>}>
      <ChurnFormRouteClient />
    </Suspense>
  );
}

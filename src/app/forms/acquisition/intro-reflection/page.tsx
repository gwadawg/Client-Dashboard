import { Suspense } from "react";
import IntroReflectionFormClient from "./IntroReflectionFormClient";

export default function IntroReflectionFormPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500 text-center py-12">Loading form…</p>}>
      <IntroReflectionFormClient />
    </Suspense>
  );
}

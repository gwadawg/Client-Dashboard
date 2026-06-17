import { Suspense } from "react";
import CloserFormClient from "./CloserFormClient";

export default function CloserFormPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500 text-center py-12">Loading form…</p>}>
      <CloserFormClient />
    </Suspense>
  );
}

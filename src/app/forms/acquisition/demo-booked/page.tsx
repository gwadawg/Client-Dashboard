import { Suspense } from "react";
import DemoBookedFormClient from "./DemoBookedFormClient";

export default function DemoBookedFormPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500 text-center py-12">Loading form…</p>}>
      <DemoBookedFormClient />
    </Suspense>
  );
}

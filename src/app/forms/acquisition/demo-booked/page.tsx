import { Suspense } from "react";
import IntroReflectionFormClient from "../intro-reflection/IntroReflectionFormClient";

/** Legacy route — same unified intro reflection form with demo_booked context. */
export default function DemoBookedFormPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500 text-center py-12">Loading form…</p>}>
      <IntroReflectionFormClient defaultFormContext="demo_booked" />
    </Suspense>
  );
}

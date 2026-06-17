import { Suspense } from "react";
import DemoAuditFormClient from "./DemoAuditFormClient";

export default function DemoAuditFormPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500 text-center py-12">Loading form…</p>}>
      <DemoAuditFormClient />
    </Suspense>
  );
}

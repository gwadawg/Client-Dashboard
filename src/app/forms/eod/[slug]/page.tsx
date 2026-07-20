import { Suspense } from "react";
import { notFound } from "next/navigation";
import EodFormClient from "@/components/EodFormClient";
import { EOD_SLUG_TO_DEPARTMENT } from "@/lib/eod-forms";

export default async function EodFormPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const department = EOD_SLUG_TO_DEPARTMENT[slug];
  if (!department) notFound();

  return (
    <Suspense fallback={<p className="text-sm text-slate-500 text-center py-12">Loading form…</p>}>
      <EodFormClient department={department} />
    </Suspense>
  );
}

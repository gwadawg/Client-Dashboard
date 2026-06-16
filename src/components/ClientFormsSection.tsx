"use client";

import { useState } from "react";
import { FORM_TYPE_LABELS, type FormType } from "@/lib/form-submissions";
import { ONBOARDING_FIELD_LABELS } from "@/lib/onboarding-form";
import {
  formatLaunchItemStatus,
  LAUNCH_CHECKLIST_ITEMS,
  LAUNCH_SECTIONS,
  launchResponsesToDraft,
} from "@/lib/launch-form";
import { formatStatesLicensed } from "@/lib/us-states";

export type FormSubmissionSummary = {
  id: string;
  form_type: FormType;
  status: string;
  submitted_by: string | null;
  submitted_at: string;
  responses: Record<string, unknown>;
  applied_patch?: Record<string, unknown> | null;
};

const PM_LABELS: Record<string, string> = {
  pm_landing_copy: "Landing page copy",
  pm_brand_assets: "Brand colors / assets",
  pm_compliance_notes: "Compliance disclaimers",
  pm_competitor_refs: "Competitor references",
  pm_funnel_requirements: "Funnel requirements",
};

function formatValue(key: string, value: unknown): string {
  if (value == null || value === "") return "—";
  if (key === "states_licensed" && Array.isArray(value)) {
    return formatStatesLicensed(value as string[]) || "—";
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function humanizeLaunchResponses(responses: Record<string, unknown>): { label: string; value: string; section?: string }[] {
  const draft = launchResponsesToDraft(responses);
  const rows: { label: string; value: string; section?: string }[] = [];

  if (responses.completed_by_label) {
    rows.push({ label: "Completed by", value: String(responses.completed_by_label) });
  }
  if (responses.launch_date) {
    rows.push({ label: "Launch date", value: String(responses.launch_date) });
  }

  for (const section of LAUNCH_SECTIONS) {
    rows.push({ label: section.label, value: "", section: section.label });
    const items = LAUNCH_CHECKLIST_ITEMS.filter(item => item.section === section.id);
    for (const item of items) {
      const status = formatLaunchItemStatus(item, draft);
      const value =
        status === "confirmed_typed_yes"
          ? "✓ Confirmed (typed yes)"
          : status === "confirmed"
            ? "✓ Confirmed"
            : "—";
      rows.push({ label: item.label, value, section: section.label });
    }
  }

  if (responses.notes) rows.push({ label: "Notes", value: String(responses.notes) });
  return rows;
}

function humanizeResponses(formType: FormType, responses: Record<string, unknown>): { label: string; value: string; section?: string }[] {
  if (formType === "launch") {
    return humanizeLaunchResponses(responses);
  }

  if (formType === "kickoff") {
    return Object.entries(PM_LABELS)
      .filter(([k]) => responses[k])
      .map(([k, label]) => ({ label, value: formatValue(k, responses[k]) }));
  }

  if (formType === "onboarding") {
    return Object.entries(ONBOARDING_FIELD_LABELS)
      .filter(([k]) => responses[k] != null && responses[k] !== "")
      .map(([k, label]) => ({ label, value: formatValue(k, responses[k]) }));
  }

  return Object.entries(responses)
    .slice(0, 12)
    .map(([k, v]) => ({ label: k.replace(/_/g, " "), value: formatValue(k, v) }));
}

export default function ClientFormsSection({ submissions }: { submissions: FormSubmissionSummary[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (submissions.length === 0) {
    return (
      <p className="text-sm" style={{ color: "#64748b" }}>
        No form submissions on file yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {submissions.map(s => {
        const isOpen = expanded === s.id;
        const rows = humanizeResponses(s.form_type, s.responses ?? {});
        return (
          <div
            key={s.id}
            className="rounded-lg overflow-hidden"
            style={{ border: "1px solid rgba(255,255,255,0.06)", background: "#0a1628" }}
          >
            <button
              type="button"
              onClick={() => setExpanded(isOpen ? null : s.id)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <div>
                <p className="text-sm font-medium" style={{ color: "#e2e8f0" }}>
                  {FORM_TYPE_LABELS[s.form_type]}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
                  {new Date(s.submitted_at).toLocaleString()}
                  {s.form_type === "launch" && s.responses?.completed_by_label
                    ? ` · ${String(s.responses.completed_by_label)}`
                    : s.submitted_by
                      ? ` · ${s.submitted_by}`
                      : ""}
                  {s.status ? ` · ${s.status}` : ""}
                </p>
              </div>
              <span className="text-xs" style={{ color: "#94a3b8" }}>{isOpen ? "▲" : "▼"}</span>
            </button>
            {isOpen && (
              <div className="px-4 pb-4 space-y-2 border-t border-white/5">
                {rows.map(row => (
                  row.value === "" && row.section ? (
                    <p key={row.label} className="text-xs font-semibold pt-3" style={{ color: "#94a3b8" }}>
                      {row.label}
                    </p>
                  ) : (
                    <div key={`${row.section ?? ""}-${row.label}`} className="flex gap-3 text-xs pt-2">
                      <span className="w-36 flex-shrink-0" style={{ color: "#64748b" }}>{row.label}</span>
                      <span style={{ color: "#cbd5e1" }}>{row.value}</span>
                    </div>
                  )
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function FormProgressStrip({ progress }: { progress?: Partial<Record<FormType, boolean>> }) {
  const steps: FormType[] = ["new_client", "onboarding", "kickoff", "launch"];
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium" title="Onboarding form progress">
      {steps.map(step => {
        const done = progress?.[step];
        return (
          <span
            key={step}
            className="px-1.5 py-0.5 rounded"
            style={{
              color: done ? "#86efac" : "#475569",
              background: done ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.04)",
            }}
          >
            {step === "new_client" ? "Sign" : step === "onboarding" ? "OB" : step === "kickoff" ? "KO" : "Live"}
            {done ? " ✓" : ""}
          </span>
        );
      })}
    </span>
  );
}

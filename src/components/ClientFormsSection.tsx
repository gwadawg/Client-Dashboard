"use client";

import { useState } from "react";
import { FORM_TYPE_LABELS, type FormType } from "@/lib/form-submissions";
import { ONBOARDING_FIELD_LABELS } from "@/lib/onboarding-form";
import {
  formatLaunchItemStatus,
  getLaunchItemsForProfile,
  getLaunchSectionsForProfile,
  launchResponsesToDraft,
  profileFromLaunchResponses,
} from "@/lib/launch-form";
import { CC_KICKOFF_FIELD_LABELS } from "@/lib/kickoff";
import { getReportingTypeLabel } from "@/lib/reporting-types";
import { getServiceProgramLabel } from "@/lib/service-program";
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

const KICKOFF_META_LABELS: Record<string, string> = {
  reporting_type: "Client vertical",
  service_program: "Service program",
  form_profile: "Form profile",
  vertical_confirmed: "Vertical confirmed",
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
  const profile = profileFromLaunchResponses(responses);
  const draft = launchResponsesToDraft(responses, profile);
  const rows: { label: string; value: string; section?: string }[] = [];

  if (responses.reporting_type) {
    rows.push({ label: "Client vertical", value: getReportingTypeLabel(responses.reporting_type) });
  }
  if (responses.service_program) {
    rows.push({ label: "Service program", value: getServiceProgramLabel(responses.service_program) ?? String(responses.service_program) });
  }
  if (responses.completed_by_label) {
    rows.push({ label: "Completed by", value: String(responses.completed_by_label) });
  }
  if (responses.launch_date) {
    rows.push({ label: "Launch date", value: String(responses.launch_date) });
  }

  for (const section of getLaunchSectionsForProfile(profile)) {
    rows.push({ label: section.label, value: "", section: section.label });
    const items = getLaunchItemsForProfile(profile).filter(item => item.section === section.id);
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
    const rows: { label: string; value: string }[] = [];
    if (responses.reporting_type) {
      rows.push({ label: KICKOFF_META_LABELS.reporting_type, value: getReportingTypeLabel(responses.reporting_type) });
    }
    if (responses.service_program) {
      rows.push({
        label: KICKOFF_META_LABELS.service_program,
        value: getServiceProgramLabel(responses.service_program) ?? String(responses.service_program),
      });
    }
    for (const [k, label] of Object.entries(PM_LABELS)) {
      if (responses[k]) rows.push({ label, value: formatValue(k, responses[k]) });
    }
    for (const [k, label] of Object.entries(CC_KICKOFF_FIELD_LABELS)) {
      if (responses[k]) rows.push({ label, value: formatValue(k, responses[k]) });
    }
    return rows;
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

const PROGRESS_STEPS: { key: FormType; label: string; full: string }[] = [
  { key: "new_client", label: "Sign", full: "Signed" },
  { key: "onboarding", label: "OB", full: "Onboarding" },
  { key: "kickoff", label: "KO", full: "Kick-off" },
  { key: "launch", label: "Live", full: "Launched" },
];

/**
 * Process-stage cards (Sign → OB → KO → Live). Each step reads as a discrete
 * card that fills green once the matching form exists, giving an at-a-glance
 * read of where a client sits in the onboarding process.
 */
export function FormProgressStrip({ progress }: { progress?: Partial<Record<FormType, boolean>> }) {
  return (
    <span className="inline-flex items-center gap-1">
      {PROGRESS_STEPS.map(({ key, label, full }) => {
        const done = !!progress?.[key];
        return (
          <span
            key={key}
            title={`${full} ${done ? "complete" : "pending"}`}
            className="inline-flex items-center justify-center min-w-[2.1rem] px-1.5 py-1 rounded-md text-[10px] font-semibold tracking-wide"
            style={{
              color: done ? "#86efac" : "#475569",
              background: done ? "rgba(34,197,94,0.14)" : "rgba(255,255,255,0.03)",
              border: done ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(255,255,255,0.06)",
            }}
          >
            {label}
          </span>
        );
      })}
    </span>
  );
}

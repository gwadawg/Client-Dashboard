"use client";

import { useState, type ReactNode } from "react";
import StatesLicensedSelect from "@/components/StatesLicensedSelect";
import TimezoneSelect from "@/components/TimezoneSelect";
import ReportingTypeBadge, { ReportingTypeSelectOptions } from "@/components/ReportingTypeBadge";
import { normalizeReportingType, type ReportingType } from "@/lib/kpi-layouts";
import { getReportingTypeLabel } from "@/lib/reporting-types";
import { toDateInputValue } from "@/lib/client-dates";
import ClientLeadSourceSelect from "@/components/ClientLeadSourceSelect";
import { normalizeClientLeadSource } from "@/lib/client-lead-source";

export type EditableClient = {
  name: string;
  primary_contact_name: string | null;
  primary_contact: string | null;
  email: string | null;
  billing_email: string | null;
  phone: string | null;
  reporting_type: string | null;
  offer?: string | null;
  service_program?: string | null;
  clickup_task_id?: string | null;
  source: string | null;
  website: string | null;
  brokerage_name: string | null;
  nmls: string | null;
  state: string | null;
  states_licensed: string[] | null;
  timezone: string | null;
  lifecycle_status: string | null;
  is_live: boolean | null;
  billing_type: string | null;
  mrr: number | null;
  billing_day: number | null;
  launch_date: string | null;
  date_signed: string | null;
  contract_term_months: number | null;
  contract_end_date: string | null;
  daily_adspend: number | null;
  performance_terms: string | null;
  churned_at: string | null;
};

type Draft = {
  name: string;
  primary_contact_name: string;
  email: string;
  billing_email: string;
  phone: string;
  reporting_type: ReportingType;
  clickup_task_id: string;
  source: string;
  website: string;
  brokerage_name: string;
  nmls: string;
  state: string;
  states_licensed: string[];
  timezone: string;
  lifecycle_status: string;
  is_live: boolean;
  billing_type: string;
  mrr: string;
  billing_day: string;
  launch_date: string;
  date_signed: string;
  contract_term_months: string;
  contract_end_date: string;
  daily_adspend: string;
  performance_terms: string;
  churned_at: string;
};

const LIFECYCLE_OPTIONS = ["new_account", "onboarding", "active", "paused", "off_boarding", "churned"];

const inputStyle = (missing = false) => ({
  background: "#0f2040",
  border: missing ? "1px solid rgba(245,158,11,0.45)" : "1px solid rgba(255,255,255,0.12)",
  color: "#e2e8f0",
});

export function clientToDraft(c: EditableClient): Draft {
  return {
    name: c.name ?? "",
    primary_contact_name: c.primary_contact_name || c.primary_contact || "",
    email: c.email ?? "",
    billing_email: c.billing_email ?? "",
    phone: c.phone ?? "",
    reporting_type: normalizeReportingType(c.reporting_type),
    clickup_task_id: c.clickup_task_id ?? "",
    source: normalizeClientLeadSource(c.source) ?? "",
    website: c.website ?? "",
    brokerage_name: c.brokerage_name ?? "",
    nmls: c.nmls ?? "",
    state: c.state ?? "",
    states_licensed: c.states_licensed ?? [],
    timezone: c.timezone ?? "",
    lifecycle_status: c.lifecycle_status ?? "active",
    is_live: c.is_live ?? false,
    billing_type: c.billing_type ?? "",
    mrr: c.mrr != null ? String(c.mrr) : "",
    billing_day: c.billing_day != null ? String(c.billing_day) : "",
    launch_date: toDateInputValue(c.launch_date),
    date_signed: toDateInputValue(c.date_signed),
    contract_term_months: c.contract_term_months != null ? String(c.contract_term_months) : "",
    contract_end_date: toDateInputValue(c.contract_end_date),
    daily_adspend: c.daily_adspend != null ? String(c.daily_adspend) : "",
    performance_terms: c.performance_terms ?? "",
    churned_at: toDateInputValue(c.churned_at),
  };
}

export function draftToPatchBody(draft: Draft, canViewRevenue: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: draft.name.trim(),
    primary_contact_name: draft.primary_contact_name.trim() || null,
    email: draft.email.trim() || null,
    billing_email: draft.billing_email.trim() || null,
    phone: draft.phone.trim() || null,
    reporting_type: draft.reporting_type,
    clickup_task_id: draft.clickup_task_id.trim() || null,
    source: normalizeClientLeadSource(draft.source),
    website: draft.website.trim() || null,
    brokerage_name: draft.brokerage_name.trim() || null,
    nmls: draft.nmls.trim() || null,
    state: draft.state.trim() || null,
    states_licensed: draft.states_licensed,
    timezone: draft.timezone.trim() || null,
    lifecycle_status: draft.lifecycle_status,
    billing_type: draft.billing_type || null,
    billing_day: draft.billing_day.trim() || null,
    launch_date: draft.launch_date || null,
    date_signed: draft.date_signed || null,
    contract_term_months: draft.contract_term_months.trim() || null,
    contract_end_date: draft.contract_end_date || null,
    performance_terms: draft.performance_terms.trim() || null,
  };
  if (draft.lifecycle_status === "churned") {
    body.churned_at = draft.churned_at || null;
  }
  if (canViewRevenue) {
    body.mrr = draft.mrr.trim() || null;
    body.daily_adspend = draft.daily_adspend.trim() || null;
  }
  return body;
}

export function countMissingFields(c: EditableClient | null): number {
  if (!c) return 0;
  const checks = [
    !c.primary_contact_name && !c.primary_contact,
    !c.email && !c.billing_email,
    !c.phone,
    !normalizeClientLeadSource(c.source),
    !c.website,
    !c.brokerage_name,
    !c.nmls,
    !c.state,
    !c.states_licensed?.length,
    !c.timezone,
    !c.launch_date,
    !c.date_signed,
    c.contract_term_months == null,
    !c.billing_type,
  ];
  return checks.filter(Boolean).length;
}

export default function ClientFileEditForm({
  client,
  canViewRevenue,
  saving,
  saveError,
  onSave,
  onRequestOffboard,
}: {
  client: EditableClient;
  canViewRevenue: boolean;
  saving: boolean;
  saveError: string | null;
  onSave: (body: Record<string, unknown>) => void | Promise<void>;
  onRequestOffboard?: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => clientToDraft(client));
  const [submitting, setSubmitting] = useState(false);
  const busy = saving || submitting;

  function patch<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft(prev => ({ ...prev, [key]: value }));
  }

  async function submit() {
    if (!draft.name.trim()) return;
    if (draft.lifecycle_status === "churned" && client.lifecycle_status !== "churned") {
      onRequestOffboard?.();
      return;
    }
    setSubmitting(true);
    try {
      await onSave(draftToPatchBody(draft, canViewRevenue));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-7">
      {saveError && (
        <p className="text-sm px-3 py-2 rounded-lg" style={{ color: "#ef4444", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
          {saveError}
        </p>
      )}

      <Section title="Overview">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3">
          <Field label="Sub-account name *" value={draft.name} onChange={v => patch("name", v)} />
          <Field label="Client name" value={draft.primary_contact_name} onChange={v => patch("primary_contact_name", v)} highlightEmpty />
          <Field label="Email" type="email" value={draft.email} onChange={v => patch("email", v)} highlightEmpty />
          <Field label="Billing email" type="email" value={draft.billing_email} onChange={v => patch("billing_email", v)} highlightEmpty />
          <Field label="Phone" value={draft.phone} onChange={v => patch("phone", v)} highlightEmpty />
          <SelectField label="Product" value={draft.reporting_type} onChange={v => {
            patch("reporting_type", normalizeReportingType(v));
          }}>
            <ReportingTypeSelectOptions />
          </SelectField>
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wider" style={{ color: !draft.source ? "#f59e0b" : "#475569" }}>
              Lead source{!draft.source ? " · missing" : ""}
            </span>
            <ClientLeadSourceSelect
              value={draft.source}
              disabled={busy}
              highlightEmpty
              onChange={v => patch("source", v)}
            />
          </label>
          <Field label="Website" value={draft.website} onChange={v => patch("website", v)} highlightEmpty />
          <Field label="Brokerage" value={draft.brokerage_name} onChange={v => patch("brokerage_name", v)} highlightEmpty />
          <Field label="NMLS" value={draft.nmls} onChange={v => patch("nmls", v)} highlightEmpty />
          <Field label="State" value={draft.state} onChange={v => patch("state", v)} highlightEmpty />
          <Field
            label="ClickUp task ID"
            value={draft.clickup_task_id}
            onChange={v => patch("clickup_task_id", v)}
            placeholder="e.g. 86abc123"
          />
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wider" style={{ color: !draft.states_licensed.length ? "#f59e0b" : "#475569" }}>
              Licensed in{!draft.states_licensed.length ? " · missing" : ""}
            </span>
            <StatesLicensedSelect
              value={draft.states_licensed}
              disabled={busy}
              onChange={codes => patch("states_licensed", codes)}
              className="w-full"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wider" style={{ color: !draft.timezone ? "#f59e0b" : "#475569" }}>
              Timezone{!draft.timezone ? " · missing" : ""}
            </span>
            <TimezoneSelect
              value={draft.timezone}
              disabled={busy}
              highlightEmpty
              onChange={tz => patch("timezone", tz ?? "")}
            />
          </label>
          <SelectField label="Lifecycle" value={draft.lifecycle_status} onChange={v => {
            if (v === "churned" && client.lifecycle_status !== "churned") {
              onRequestOffboard?.();
              return;
            }
            patch("lifecycle_status", v);
          }}>
            {LIFECYCLE_OPTIONS.map(o => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
          </SelectField>
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wider" style={{ color: "#475569" }}>Reporting</span>
            <span
              className="text-sm font-semibold px-2 py-1.5 rounded-lg w-fit"
              style={
                draft.lifecycle_status === "active"
                  ? { color: "#22c55e", background: "rgba(34,197,94,0.12)" }
                  : { color: "#64748b", background: "rgba(100,116,139,0.12)" }
              }
            >
              {draft.lifecycle_status === "active" ? "Live in dashboards" : "Offline — not in reporting views"}
            </span>
          </label>
        </div>
      </Section>

      <Section title="Billing setup">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3">
          <SelectField label="Billing type" value={draft.billing_type} onChange={v => patch("billing_type", v)} highlightEmpty>
            <option value="">Monthly (default)</option>
            <option value="monthly">Monthly</option>
            <option value="pif">PIF</option>
            <option value="pif_monthly">PIF + Monthly</option>
          </SelectField>
          {canViewRevenue && (
            <>
              <Field label="Monthly $ (base)" type="number" value={draft.mrr} onChange={v => patch("mrr", v)} />
              <Field label="Daily ad spend" type="number" value={draft.daily_adspend} onChange={v => patch("daily_adspend", v)} />
            </>
          )}
          <Field label="Billing day (1–31)" type="number" value={draft.billing_day} onChange={v => patch("billing_day", v)} placeholder="Launch day if blank" />
          <Field label="Launch date" type="date" value={draft.launch_date} onChange={v => patch("launch_date", v)} highlightEmpty />
          <Field label="Date signed" type="date" value={draft.date_signed} onChange={v => patch("date_signed", v)} highlightEmpty />
          <Field label="Contract term (mo)" type="number" value={draft.contract_term_months} onChange={v => patch("contract_term_months", v)} highlightEmpty />
          <Field label="Contract end" type="date" value={draft.contract_end_date} onChange={v => patch("contract_end_date", v)} />
          {draft.lifecycle_status === "churned" && (
            <Field label="Churn date" type="date" value={draft.churned_at} onChange={v => patch("churned_at", v)} />
          )}
        </div>
        <div className="mt-4">
          <Field label="Performance terms" value={draft.performance_terms} onChange={v => patch("performance_terms", v)} wide multiline />
        </div>
        {draft.lifecycle_status === "churned" && !draft.churned_at && (
          <p className="text-xs mt-3" style={{ color: "#f59e0b" }}>No churn date on file — set one above to backfill reporting.</p>
        )}
      </Section>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={busy || !draft.name.trim()}
          className="text-xs font-semibold px-4 py-2 rounded-lg"
          style={{ color: "#22c55e", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", opacity: busy || !draft.name.trim() ? 0.5 : 1 }}
        >
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "#cbd5e1" }}>{title}</h3>
      {children}
    </section>
  );
}

function Field({
  label, value, onChange, type = "text", placeholder, highlightEmpty, wide, multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  highlightEmpty?: boolean;
  wide?: boolean;
  multiline?: boolean;
}) {
  const missing = highlightEmpty && !value.trim();
  const cls = "px-2 py-1.5 rounded-lg text-sm outline-none w-full";
  return (
    <label className={wide ? "col-span-2 md:col-span-3 flex flex-col gap-1" : "flex flex-col gap-1"}>
      <span className="text-xs uppercase tracking-wider" style={{ color: missing ? "#f59e0b" : "#475569" }}>
        {label}{missing ? " · missing" : ""}
      </span>
      {multiline ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} rows={3} placeholder={placeholder} className={cls} style={inputStyle(missing)} />
      ) : (
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={cls} style={inputStyle(missing)} />
      )}
    </label>
  );
}

function SelectField({
  label, value, onChange, children, highlightEmpty,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
  highlightEmpty?: boolean;
}) {
  const missing = highlightEmpty && !value;
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wider" style={{ color: missing ? "#f59e0b" : "#475569" }}>
        {label}{missing ? " · missing" : ""}
      </span>
      <select value={value} onChange={e => onChange(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none cursor-pointer w-full" style={inputStyle(missing)}>
        {children}
      </select>
    </label>
  );
}

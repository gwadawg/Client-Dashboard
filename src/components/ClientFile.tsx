"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import CheckinCallFormFields from "@/components/CheckinCallFormFields";
import CheckinCallSummary from "@/components/CheckinCallSummary";
import ClientCallFormFields from "@/components/ClientCallFormFields";
import {
  defaultCallDraft,
  callDraftToApiBody,
  validateCallDraft,
  type ClientCallDraft,
} from "@/lib/client-call-draft";
import {
  CALL_DISPOSITION_OPTIONS,
  CALL_TYPE_OPTIONS,
  callTypeLabel,
  dispositionLabel,
} from "@/lib/client-calls";
import {
  buildCheckinSummary,
  draftToStored,
  storedToDraft,
  type CheckinFormData,
  type StoredCheckinForm,
} from "@/lib/checkin-form";
import {
  LIFECYCLE_REASON_OPTIONS,
  NOTE_TYPE_OPTIONS,
  lifecycleStatusLabel,
  noteTypeLabel,
  reasonLabel,
} from "@/lib/client-feedback";
import ReportingTypeBadge, { ServiceProgramBadge } from "@/components/ReportingTypeBadge";
import { getReportingTypeLabel } from "@/lib/reporting-types";
import { getServiceProgramLabel } from "@/lib/service-program";
import { clientLeadSourceLabel } from "@/lib/client-lead-source";
import { formatStatesLicensed } from "@/lib/us-states";
import { timezoneLabel } from "@/lib/us-timezones";
import ClientContactsSection from "@/components/ClientContactsSection";
import ClientFileEditForm, { countMissingFields } from "@/components/ClientFileEditForm";
import { toDateInputValue } from "@/lib/client-dates";
import LifecycleStatusSelect from "@/components/LifecycleStatusSelect";
import ClientFormsSection, { type FormSubmissionSummary } from "@/components/ClientFormsSection";
import KickOffCallWizard from "@/components/KickOffCallWizard";
import LaunchChecklistWizard from "@/components/LaunchChecklistWizard";
import ChurnOffboardingWizard from "@/components/ChurnOffboardingWizard";
import StatusChangeModal from "@/components/StatusChangeModal";
import ClientInterventionHistory from "@/components/ClientInterventionHistory";
import ClientAccountOffersPanel from "@/components/ClientAccountOffersPanel";
import { requiresLifecycleFeedback } from "@/lib/client-feedback";
import { isKickoffIncomplete, isKickoffLifecycle } from "@/lib/kickoff";
import type { ClientContact } from "@/lib/client-contacts";

// The client "file": a single place to oversee everything about one client.
// Profile, billing history, lifecycle transitions, and ongoing notes.

type FileBilling = {
  id: string;
  billed_on: string;
  due_date: string | null;
  amount: number;
  base_amount: number | null;
  performance_amount: number | null;
  late_fee: number | null;
  discount: number | null;
  passthrough_amount: number | null;
  amount_paid: number | null;
  status: string;
  paid_on: string | null;
  method: string | null;
  note: string | null;
  revenue_type: string | null;
  revenue_segment: string | null;
  lead_source: string | null;
  term_months: number | null;
  processing_fee: number | null;
  created_at: string;
};

type FileClient = {
  id: string;
  name: string;
  is_live: boolean | null;
  reporting_type: string | null;
  offer?: string | null;
  service_program?: string | null;
  lifecycle_status: string | null;
  client_stage: string | null;
  mrr: number | null;
  billing_type: string | null;
  billing_day: number | null;
  launch_date: string | null;
  date_signed: string | null;
  contract_end_date: string | null;
  contract_term_months: number | null;
  daily_adspend: number | null;
  performance_terms: string | null;
  billing_email: string | null;
  primary_contact: string | null;
  primary_contact_name: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  website: string | null;
  brokerage_name: string | null;
  nmls: string | null;
  state: string | null;
  states_licensed: string[] | null;
  timezone: string | null;
  ghl_location_id: string | null;
  clickup_task_id?: string | null;
  created_at: string | null;
  churned_at: string | null;
};

type StatusHistoryEntry = {
  id: string;
  previous_status: string | null;
  new_status: string;
  reason_code: string | null;
  note: string | null;
  mrr_at_change: number | null;
  changed_at: string;
  source: string | null;
};

type ClientNote = {
  id: string;
  note_type: string;
  reason_code: string | null;
  body: string;
  created_at: string;
  created_by_label?: string | null;
  updated_at?: string | null;
};

type ClientCall = {
  id: string;
  call_type: string;
  called_at: string;
  recording_url: string | null;
  transcript: string | null;
  notes: string | null;
  attendees: string | null;
  checkin_form: StoredCheckinForm | null;
  duration_seconds: number | null;
  disposition: string | null;
  follow_up_due_at: string | null;
  created_by_label?: string | null;
  updated_at: string;
};

type ActivityRow = {
  source_id: string;
  activity_type: string;
  occurred_at: string;
  subtype: string | null;
  summary: string | null;
  source_table: string;
};

type TabKey = "overview" | "records" | "activity" | "billing";

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "records", label: "Forms & history" },
  { key: "activity", label: "Calls & notes" },
  { key: "billing", label: "Billing" },
];

const ACTIVITY_STYLE: Record<string, { color: string; bg: string }> = {
  lifecycle: { color: "#a78bfa", bg: "rgba(167,139,250,0.12)" },
  call: { color: "#38bdf8", bg: "rgba(56,189,248,0.12)" },
  note: { color: "#f472b6", bg: "rgba(244,114,182,0.12)" },
  action: { color: "#fbbf24", bg: "rgba(251,191,36,0.12)" },
  billing: { color: "#34d399", bg: "rgba(52,211,153,0.12)" },
};

const STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  paid: { color: "#22c55e", bg: "rgba(34,197,94,0.12)" },
  partial: { color: "#38bdf8", bg: "rgba(56,189,248,0.12)" },
  pending: { color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  overdue: { color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
  failed: { color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
  refunded: { color: "#94a3b8", bg: "rgba(148,163,184,0.12)" },
};

const REVENUE_TYPE_LABEL: Record<string, string> = {
  mrr: "Retainer",
  pif: "PIF",
  performance: "Performance",
  passthrough: "Passthrough",
};

const fieldStyle = {
  background: "#050c18",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#e2e8f0",
  borderRadius: "0.5rem",
  padding: "0.5rem 0.75rem",
  fontSize: "0.8125rem",
  outline: "none",
  width: "100%",
} as const;

function money(n: number | null | undefined): string {
  if (typeof n !== "number" || Number.isNaN(n)) return "—";
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ClientFile({
  clientId,
  fallbackName,
  onClose,
  onUpdated,
  onSwitchClient,
  onOfferCreated,
  scrollToNotes = false,
  scrollToCalls = false,
  openCheckinForm = false,
  openKickoff = false,
  openAddOffer = false,
}: {
  clientId: string;
  fallbackName: string;
  onClose: () => void;
  onUpdated?: () => void;
  onSwitchClient?: (id: string, name: string) => void;
  onOfferCreated?: (id: string, name: string) => void;
  scrollToNotes?: boolean;
  scrollToCalls?: boolean;
  openCheckinForm?: boolean;
  openKickoff?: boolean;
  openAddOffer?: boolean;
}) {
  const [client, setClient] = useState<FileClient | null>(null);
  const [billings, setBillings] = useState<FileBilling[]>([]);
  const [statusHistory, setStatusHistory] = useState<StatusHistoryEntry[]>([]);
  const [formSubmissions, setFormSubmissions] = useState<FormSubmissionSummary[]>([]);
  const [notes, setNotes] = useState<ClientNote[]>([]);
  const [contacts, setContacts] = useState<ClientContact[]>([]);
  const [calls, setCalls] = useState<ClientCall[]>([]);
  const [canViewRevenue, setCanViewRevenue] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noteType, setNoteType] = useState("general");
  const [noteReason, setNoteReason] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [callDraft, setCallDraft] = useState<ClientCallDraft>(() => defaultCallDraft(clientId, "checkin"));
  const [savingCall, setSavingCall] = useState(false);
  const [callDuration, setCallDuration] = useState("");
  const [callDisposition, setCallDisposition] = useState("");
  const [callFollowUp, setCallFollowUp] = useState("");
  // Deep links from the roster (logged via a remount key) decide the initial
  // tab + open composer, so no post-mount effect is needed.
  const [activeTab, setActiveTab] = useState<TabKey>(
    () => (scrollToCalls || openCheckinForm || scrollToNotes ? "activity" : "overview"),
  );
  const [showCallComposer, setShowCallComposer] = useState(() => scrollToCalls || openCheckinForm);
  const [showNoteComposer, setShowNoteComposer] = useState(() => scrollToNotes);
  const [editingCallId, setEditingCallId] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editNoteType, setEditNoteType] = useState("general");
  const [editNoteReason, setEditNoteReason] = useState("");
  const [editNoteBody, setEditNoteBody] = useState("");
  const [savingNoteEdit, setSavingNoteEdit] = useState(false);
  const [expandedCallIds, setExpandedCallIds] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [statusChange, setStatusChange] = useState<{ targetStatus: string; pendingBody: Record<string, unknown> } | null>(null);
  const [showKickoff, setShowKickoff] = useState(openKickoff);
  const [showLaunch, setShowLaunch] = useState(false);
  const [showOffboard, setShowOffboard] = useState(false);
  const [offerRow, setOfferRow] = useState<{ name: string; reporting_type: string | null } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    return Promise.all([
      fetch(`/api/clients/${clientId}`).then(r => r.json()),
      fetch(`/api/clients/${clientId}/activity?limit=80`).then(r => r.json()),
    ])
      .then(([d, activityRes]) => {
        if (d.error) {
          setError(d.error);
        } else {
          setClient(d.client ?? null);
          setOfferRow(d.offer ? { name: d.offer.name, reporting_type: d.offer.reporting_type ?? null } : null);
          setBillings(d.billings ?? []);
          setStatusHistory(d.status_history ?? []);
          setNotes(d.notes ?? []);
          setContacts(d.contacts ?? []);
          setCalls(d.calls ?? []);
          setFormSubmissions(d.form_submissions ?? []);
          if (typeof d.can_view_revenue === "boolean") setCanViewRevenue(d.can_view_revenue);
          setError(null);
        }
        setActivities(activityRes.activities ?? []);
        setLoading(false);
      })
      .catch(e => {
        setError(String(e));
        setLoading(false);
      });
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (editing) { setEditing(false); setSaveError(null); }
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, onClose]);

  const summary = useMemo(() => {
    let collected = 0, retainer = 0, performance = 0, passthrough = 0;
    let lastPaidOn: string | null = null;
    for (const b of billings) {
      collected += Number(b.amount_paid) || 0;
      retainer += Number(b.base_amount) || 0;
      performance += Number(b.performance_amount) || 0;
      passthrough += Number(b.passthrough_amount) || 0;
      if (b.paid_on && (!lastPaidOn || b.paid_on > lastPaidOn)) lastPaidOn = b.paid_on;
    }
    return { collected, retainer, performance, passthrough, count: billings.length, lastPaidOn };
  }, [billings]);

  async function submitCall() {
    const validationError = validateCallDraft(callDraft, false);
    if (validationError) {
      alert(validationError);
      return;
    }

    setSavingCall(true);
    const res = await fetch(`/api/clients/${clientId}/calls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...callDraftToApiBody(callDraft),
        duration_seconds: callDuration.trim() ? Number(callDuration) : undefined,
        disposition: callDisposition || undefined,
        follow_up_due_at: callFollowUp ? new Date(callFollowUp).toISOString() : undefined,
      }),
    });
    const d = await res.json();
    if (!res.ok) {
      alert(d.error ?? "Failed to save call");
      setSavingCall(false);
      return;
    }
    setCallDraft(defaultCallDraft(clientId, "checkin"));
    setCallDuration("");
    setCallDisposition("");
    setCallFollowUp("");
    setShowCallComposer(false);
    await load();
    onUpdated?.();
    setSavingCall(false);
  }

  async function saveCallEdit(call: ClientCall, form: {
    call_type: string;
    called_at: string;
    recording_url: string;
    transcript: string;
    notes: string;
    attendees: string;
    checkin_form: CheckinFormData;
    duration_seconds: string;
    disposition: string;
    follow_up_due_at: string;
  }) {
    const storedCheckin = form.call_type === "checkin" ? draftToStored(form.checkin_form) : null;
    if (form.call_type === "checkin" && !storedCheckin?.client_sentiment) {
      alert("Client sentiment is required for check-in calls");
      return false;
    }
    const notes =
      form.notes.trim()
      || (storedCheckin ? buildCheckinSummary(storedCheckin) : "");

    const res = await fetch(`/api/clients/${clientId}/calls/${call.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        call_type: form.call_type,
        called_at: new Date(form.called_at).toISOString(),
        recording_url: form.recording_url || null,
        transcript: form.transcript || null,
        notes: notes || null,
        attendees: form.attendees || null,
        checkin_form: storedCheckin,
        duration_seconds: form.duration_seconds.trim() ? Number(form.duration_seconds) : null,
        disposition: form.disposition || null,
        follow_up_due_at: form.follow_up_due_at ? new Date(form.follow_up_due_at).toISOString() : null,
      }),
    });
    const d = await res.json();
    if (!res.ok) {
      alert(d.error ?? "Failed to update call");
      return false;
    }
    setEditingCallId(null);
    await load();
    onUpdated?.();
    return true;
  }

  async function deleteCall(callId: string) {
    if (!confirm("Remove this call from the client file? (Soft-delete — can be restored from DB.)")) return;
    const res = await fetch(`/api/clients/${clientId}/calls/${callId}`, { method: "DELETE" });
    const d = await res.json();
    if (!res.ok) {
      alert(d.error ?? "Failed to remove call");
      return;
    }
    await load();
    onUpdated?.();
  }

  function startNoteEdit(note: ClientNote) {
    setEditingNoteId(note.id);
    setEditNoteType(note.note_type);
    setEditNoteReason(note.reason_code ?? "");
    setEditNoteBody(note.body);
  }

  async function saveNoteEdit(noteId: string) {
    const body = editNoteBody.trim();
    if (!body) return;
    setSavingNoteEdit(true);
    const res = await fetch(`/api/clients/${clientId}/notes/${noteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body,
        note_type: editNoteType,
        reason_code: editNoteReason || null,
      }),
    });
    const d = await res.json();
    if (!res.ok) {
      alert(d.error ?? "Failed to update note");
      setSavingNoteEdit(false);
      return;
    }
    setEditingNoteId(null);
    await load();
    onUpdated?.();
    setSavingNoteEdit(false);
  }

  async function deleteNote(noteId: string) {
    if (!confirm("Remove this note?")) return;
    const res = await fetch(`/api/clients/${clientId}/notes/${noteId}`, { method: "DELETE" });
    const d = await res.json();
    if (!res.ok) {
      alert(d.error ?? "Failed to remove note");
      return;
    }
    await load();
    onUpdated?.();
  }

  function toggleCallExpanded(id: string) {
    setExpandedCallIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submitNote() {
    const body = noteBody.trim();
    if (!body) return;
    setSavingNote(true);
    const res = await fetch(`/api/clients/${clientId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        note_type: noteType,
        reason_code: noteReason || undefined,
        body,
      }),
    });
    const d = await res.json();
    if (!res.ok) {
      alert(d.error ?? "Failed to save note");
      setSavingNote(false);
      return;
    }
    setNoteBody("");
    setNoteReason("");
    setNoteType("general");
    setShowNoteComposer(false);
    await load();
    onUpdated?.();
    setSavingNote(false);
  }

  async function commitProfileSave(body: Record<string, unknown>) {
    setSavingProfile(true);
    setSaveError(null);
    const res = await fetch(`/api/clients/${clientId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setSaveError(typeof d.error === "string" ? d.error : "Save failed");
      setSavingProfile(false);
      return false;
    }
    if (d.client) setClient(d.client);
    setEditing(false);
    setStatusChange(null);
    await load();
    onUpdated?.();
    setSavingProfile(false);
    return true;
  }

  async function saveProfile(body: Record<string, unknown>) {
    if (!body.name) {
      setSaveError("Sub-account name is required.");
      return;
    }
    const newLifecycle = typeof body.lifecycle_status === "string" ? body.lifecycle_status : null;
    const currentLifecycle = client?.lifecycle_status ?? null;
    if (newLifecycle === "churned" && newLifecycle !== currentLifecycle) {
      setEditing(false);
      setShowOffboard(true);
      return;
    }
    if (
      newLifecycle &&
      newLifecycle !== currentLifecycle &&
      requiresLifecycleFeedback(newLifecycle)
    ) {
      setStatusChange({ targetStatus: newLifecycle, pendingBody: body });
      return;
    }
    await commitProfileSave(body);
  }

  async function confirmLifecycleChange(reason: string | null, note: string) {
    if (!statusChange) return;
    const body = {
      ...statusChange.pendingBody,
      status_change_reason: reason,
      status_change_note: note || undefined,
    };
    await commitProfileSave(body);
  }

  const name = client?.name ?? fallbackName;
  const lifecycle = client?.lifecycle_status ?? "—";
  const missingCount = countMissingFields(client);
  const onboardingCall = calls.find(c => c.call_type === "onboarding") ?? null;
  const kickoffPending = client ? isKickoffIncomplete(client, onboardingCall) : false;

  return (
    <>
    {showKickoff && (
      <KickOffCallWizard
        clientId={clientId}
        fallbackName={name}
        onClose={() => setShowKickoff(false)}
        onCompleted={() => {
          load();
          onUpdated?.();
        }}
      />
    )}
    {showLaunch && (
      <LaunchChecklistWizard
        clientId={clientId}
        fallbackName={name}
        onClose={() => setShowLaunch(false)}
        onCompleted={() => {
          load();
          onUpdated?.();
        }}
      />
    )}
    {showOffboard && (
      <ChurnOffboardingWizard
        clientId={clientId}
        fallbackName={name}
        onClose={() => setShowOffboard(false)}
        onCompleted={() => {
          load();
          onUpdated?.();
        }}
      />
    )}
    <StatusChangeModal
      open={!!statusChange}
      clientName={name}
      targetStatus={statusChange?.targetStatus ?? "paused"}
      saving={savingProfile}
      onConfirm={confirmLifecycleChange}
      onCancel={() => setStatusChange(null)}
    />
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: "rgba(2,6,15,0.6)" }} onClick={editing ? undefined : onClose}>
      <div
        className="h-full w-full overflow-y-auto"
        style={{ maxWidth: 760, background: "#060d1a", borderLeft: "1px solid rgba(255,255,255,0.08)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 px-6 py-4 flex items-start justify-between gap-4" style={{ background: "#0a1628", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold" style={{ color: "#e2e8f0" }}>{name}</h2>
              {client?.reporting_type && <ReportingTypeBadge value={client.reporting_type} size="md" />}
              {client?.service_program && <ServiceProgramBadge value={client.service_program} size="md" />}
              {client && !editing ? (
                <LifecycleStatusSelect
                  value={client.lifecycle_status}
                  disabled={savingProfile}
                  onRequestChange={target => saveProfile({ name: client.name, lifecycle_status: target })}
                />
              ) : (
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ color: "#cbd5e1", background: "rgba(148,163,184,0.12)" }}>{lifecycle}</span>
              )}
              {client && (
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={client.lifecycle_status === "active" ? { color: "#22c55e", background: "rgba(34,197,94,0.12)" } : { color: "#ef4444", background: "rgba(239,68,68,0.12)" }}>
                  {client.lifecycle_status === "active" ? "Live" : "Offline"}
                </span>
              )}
              {!editing && missingCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ color: "#f59e0b", background: "rgba(245,158,11,0.12)" }}>
                  {missingCount} field{missingCount === 1 ? "" : "s"} missing
                </span>
              )}
            </div>
            <p className="text-xs mt-1" style={{ color: "#475569" }}>
              {editing ? "Editing profile & billing setup" : "Client file — profile, billing, lifecycle, calls & notes"}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {!loading && !error && client && !editing && (
              <>
                {(client.lifecycle_status === "onboarding" || client.lifecycle_status === "new_account") && (
                  <button
                    type="button"
                    onClick={() => setShowLaunch(true)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap"
                    style={{ color: "#34d399", background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.25)" }}
                    title="Launch checklist — mark client live"
                  >
                    Launch
                  </button>
                )}
                {client.lifecycle_status !== "churned" && (
                  <button
                    type="button"
                    onClick={() => setShowOffboard(true)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap"
                    style={{ color: "#ef4444", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)" }}
                  >
                    Offboard
                  </button>
                )}
                <button
                  onClick={() => { setEditing(true); setSaveError(null); }}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap"
                  style={{ color: "#38bdf8", background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.25)" }}
                >
                  Edit
                </button>
              </>
            )}
            {editing && (
              <button
                onClick={() => { setEditing(false); setSaveError(null); }}
                disabled={savingProfile}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap"
                style={{ color: "#94a3b8", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", opacity: savingProfile ? 0.5 : 1 }}
              >
                Cancel edit
              </button>
            )}
            <button onClick={onClose} className="text-xs font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap" style={{ color: "#94a3b8", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
              Close ✕
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-sm py-12 text-center" style={{ color: "#334155" }}>Loading file…</p>
        ) : error ? (
          <p className="text-sm py-12 text-center" style={{ color: "#ef4444" }}>{error}</p>
        ) : editing && client ? (
          <div className="px-6 py-5">
            <ClientFileEditForm
              key={`${client.id}-${client.churned_at ?? ""}-${client.launch_date ?? ""}-${client.date_signed ?? ""}-${client.clickup_task_id ?? ""}-${client.billing_email ?? ""}-${client.offer ?? ""}`}
              client={client}
              canViewRevenue={canViewRevenue}
              saving={savingProfile}
              saveError={saveError}
              onSave={saveProfile}
              onRequestOffboard={() => {
                setEditing(false);
                setShowOffboard(true);
              }}
            />
          </div>
        ) : (
          <div className="px-6 py-5 space-y-7">
            <ClientAccountOffersPanel
              clientId={clientId}
              canViewRevenue={canViewRevenue}
              defaultShowAdd={openAddOffer}
              onSwitchClient={(id, siblingName) => {
                if (onSwitchClient) onSwitchClient(id, siblingName);
              }}
              onOfferAdded={(id, siblingName) => {
                if (onOfferCreated) onOfferCreated(id, siblingName);
                else {
                  onSwitchClient?.(id, siblingName);
                  setShowKickoff(true);
                }
                onUpdated?.();
              }}
            />

            {(kickoffPending || isKickoffLifecycle(client?.lifecycle_status)) && (
              <div
                className="rounded-lg px-4 py-3 flex items-start justify-between gap-4 flex-wrap"
                style={{
                  background: kickoffPending ? "rgba(245,158,11,0.08)" : "rgba(34,197,94,0.08)",
                  border: kickoffPending ? "1px solid rgba(245,158,11,0.25)" : "1px solid rgba(34,197,94,0.25)",
                }}
              >
                <div>
                  <p className="text-sm font-semibold" style={{ color: kickoffPending ? "#f59e0b" : "#22c55e" }}>
                    {kickoffPending ? "Kick-off call incomplete" : "Kick-off call wizard"}
                  </p>
                  <p className="text-xs mt-1" style={{ color: "#94a3b8" }}>
                    {kickoffPending
                      ? "Run the kick-off wizard to confirm client details and save the GHL location ID + recording."
                      : "Open the kick-off wizard to review or update onboarding details with the client."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowKickoff(true)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap"
                  style={{
                    color: kickoffPending ? "#f59e0b" : "#22c55e",
                    background: kickoffPending ? "rgba(245,158,11,0.12)" : "rgba(34,197,94,0.12)",
                    border: kickoffPending ? "1px solid rgba(245,158,11,0.3)" : "1px solid rgba(34,197,94,0.3)",
                  }}
                >
                  Open kick-off
                </button>
              </div>
            )}

            <div className="flex items-center gap-1 border-b border-white/[0.08]">
              {TABS.map(t => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setActiveTab(t.key)}
                  className="px-3 py-2 text-sm font-semibold -mb-px transition-colors"
                  style={{
                    color: activeTab === t.key ? "#e2e8f0" : "#64748b",
                    borderBottom: `2px solid ${activeTab === t.key ? "#38bdf8" : "transparent"}`,
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {activeTab === "overview" && (
            <div className="space-y-7">

            <Section title="Client profile">
              <p className="text-xs mb-3" style={{ color: "#64748b" }}>
                Shared across all offers for this loan officer. Edits here update every linked offer row.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
                <Detail label="Client name" value={client?.primary_contact_name || client?.primary_contact} missing={!client?.primary_contact_name && !client?.primary_contact} />
                <Detail label="Email" value={client?.email} missing={!client?.email} />
                <Detail label="Billing email" value={client?.billing_email} missing={!client?.billing_email} />
                <Detail label="Phone" value={client?.phone} missing={!client?.phone} />
                <Detail label="Lead source" value={clientLeadSourceLabel(client?.source)} missing={!client?.source} />
                <Detail label="Website" value={client?.website} missing={!client?.website} />
                <Detail label="Brokerage" value={client?.brokerage_name} missing={!client?.brokerage_name} />
                <Detail label="NMLS" value={client?.nmls} missing={!client?.nmls} />
                <Detail label="State" value={client?.state} missing={!client?.state} />
                <Detail label="Licensed in" value={formatStatesLicensed(client?.states_licensed)} wide missing={!client?.states_licensed?.length} />
                <Detail label="Timezone" value={timezoneLabel(client?.timezone)} missing={!client?.timezone} />
              </div>
            </Section>

            <Section title="This offer">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
                <Detail label="GHL sub-account name" value={offerRow?.name ?? client?.name} />
                <Detail
                  label="Client vertical"
                  value={client?.reporting_type ? (
                    <span className="inline-flex items-center gap-2">
                      <ReportingTypeBadge value={client.reporting_type} size="md" />
                      <span>{getReportingTypeLabel(client.reporting_type)}</span>
                    </span>
                  ) : null}
                  missing={!client?.reporting_type}
                />
                <Detail
                  label="Service program"
                  value={client?.service_program ? (
                    <span className="inline-flex items-center gap-2">
                      <ServiceProgramBadge value={client.service_program} size="md" />
                      <span>{getServiceProgramLabel(client.service_program)}</span>
                    </span>
                  ) : "—"}
                />
                <Detail
                  label="Offer"
                  value={client?.offer ? (
                    <span className="inline-flex items-center gap-2">
                      <ReportingTypeBadge value={client.offer} size="md" />
                      <span>{getReportingTypeLabel(client.offer)}</span>
                    </span>
                  ) : null}
                />
                <Detail
                  label="ClickUp task"
                  value={client?.clickup_task_id ? (
                    <a
                      href={`https://app.clickup.com/t/${client.clickup_task_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sky-400 hover:underline"
                    >
                      {client.clickup_task_id} ↗
                    </a>
                  ) : null}
                />
              </div>
            </Section>

            <Section title={`Contacts (${contacts.length + 1})`}>
              <ClientContactsSection
                clientId={clientId}
                primary={{
                  primary_contact_name: client?.primary_contact_name ?? null,
                  primary_contact: client?.primary_contact ?? null,
                  email: client?.email ?? null,
                  billing_email: client?.billing_email ?? null,
                  phone: client?.phone ?? null,
                  nmls: client?.nmls ?? null,
                  states_licensed: client?.states_licensed ?? null,
                }}
                contacts={contacts}
                onReload={() => { load(); }}
                onEditProfile={() => setEditing(true)}
              />
            </Section>

            <Section title="Success interventions">
              <ClientInterventionHistory clientId={clientId} compact />
            </Section>

            <Section title="Account timeline">
              {activities.length === 0 ? (
                <p className="text-sm py-4 text-center rounded-lg" style={{ color: "#334155", background: "#080f1e" }}>
                  No account activity yet — lifecycle changes, calls, notes, interventions, and billings appear here.
                </p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {activities.map(a => {
                    const style = ACTIVITY_STYLE[a.activity_type] ?? { color: "#94a3b8", bg: "rgba(148,163,184,0.1)" };
                    return (
                      <div
                        key={`${a.source_table}-${a.source_id}-${a.occurred_at}`}
                        className="rounded-lg px-3 py-2.5 flex gap-3 items-start"
                        style={{ background: "#080f1e", border: "1px solid rgba(255,255,255,0.04)" }}
                      >
                        <span
                          className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5"
                          style={{ color: style.color, background: style.bg }}
                        >
                          {a.activity_type}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs" style={{ color: "#64748b" }}>{formatDateTime(a.occurred_at)}</p>
                          <p className="text-sm mt-0.5 break-words" style={{ color: "#cbd5e1" }}>{a.summary ?? "—"}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>

            <Section title="Billing setup">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
                <Detail label="Billing type" value={billingTypeLabel(client?.billing_type)} missing={!client?.billing_type} />
                {canViewRevenue && <Detail label="Monthly $ (base)" value={money(client?.mrr)} />}
                <Detail label="Billing day" value={client?.billing_day ? `Day ${client.billing_day}` : "launch day"} />
                <Detail label="Launch date" value={client?.launch_date} missing={!client?.launch_date} />
                <Detail label="Date signed" value={client?.date_signed} missing={!client?.date_signed} />
                <Detail label="Contract term" value={client?.contract_term_months ? `${client.contract_term_months} mo` : null} missing={client?.contract_term_months == null} />
                <Detail label="Contract end" value={client?.contract_end_date} />
                {canViewRevenue && <Detail label="Daily ad spend" value={money(client?.daily_adspend)} />}
                <Detail label="Churned" value={client?.churned_at ? toDateInputValue(client.churned_at) || client.churned_at : null} />
              </div>
              {client?.performance_terms && (
                <div className="mt-4">
                  <Detail label="Performance terms" value={client.performance_terms} wide />
                </div>
              )}
            </Section>
            </div>
            )}

            {activeTab === "records" && (
            <div className="space-y-7">
            <Section title={`Onboarding forms (${formSubmissions.length})`}>
              <ClientFormsSection submissions={formSubmissions} />
            </Section>

            <Section title={`Success interventions`}>
              <ClientInterventionHistory clientId={clientId} />
            </Section>

            <Section title={`Lifecycle history (${statusHistory.length})`}>
              {statusHistory.length === 0 ? (
                <p className="text-sm py-4 text-center rounded-lg" style={{ color: "#334155", background: "#080f1e" }}>No lifecycle transitions recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {statusHistory.map(h => (
                    <div
                      key={h.id}
                      className="rounded-lg px-4 py-3"
                      style={{ background: "#080f1e", border: "1px solid rgba(255,255,255,0.06)" }}
                    >
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <p className="text-sm font-medium" style={{ color: "#e2e8f0" }}>
                          {lifecycleStatusLabel(h.previous_status)} → {lifecycleStatusLabel(h.new_status)}
                        </p>
                        <span className="text-xs whitespace-nowrap" style={{ color: "#475569" }}>{formatDateTime(h.changed_at)}</span>
                      </div>
                      {h.reason_code && (
                        <p className="text-xs mt-1.5 font-semibold" style={{ color: "#f59e0b" }}>
                          Reason: {reasonLabel(h.reason_code)}
                        </p>
                      )}
                      {h.note && (
                        <p className="text-sm mt-1.5" style={{ color: "#94a3b8" }}>{h.note}</p>
                      )}
                      {canViewRevenue && h.mrr_at_change != null && (
                        <p className="text-xs mt-1" style={{ color: "#475569" }}>MRR at change: {money(h.mrr_at_change)}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Section>
            </div>
            )}

            {activeTab === "activity" && (
            <div className="space-y-7">
            <section>
              <div className="flex items-center justify-between gap-3 mb-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#cbd5e1" }}>
                  Account calls ({calls.length})
                </h3>
                <button
                  type="button"
                  onClick={() => setShowCallComposer(s => !s)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap"
                  style={{ color: "#38bdf8", background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.25)" }}
                >
                  {showCallComposer ? "Cancel" : "+ Log call"}
                </button>
              </div>

              {showCallComposer && (
              <div className="rounded-lg p-4 mb-4 space-y-3" style={{ background: "#080f1e", border: "1px solid rgba(255,255,255,0.06)" }}>
                <ClientCallFormFields draft={callDraft} onChange={setCallDraft} disabled={savingCall} />
                <div className="grid grid-cols-3 gap-3">
                  <label className="block">
                    <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>Duration (sec)</span>
                    <input type="number" min={0} value={callDuration} disabled={savingCall} onChange={e => setCallDuration(e.target.value)} className="mt-1" style={fieldStyle} />
                  </label>
                  <label className="block">
                    <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>Disposition</span>
                    <select value={callDisposition} disabled={savingCall} onChange={e => setCallDisposition(e.target.value)} className="mt-1 cursor-pointer" style={fieldStyle}>
                      <option value="">None</option>
                      {CALL_DISPOSITION_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>Follow-up due</span>
                    <input type="datetime-local" value={callFollowUp} disabled={savingCall} onChange={e => setCallFollowUp(e.target.value)} className="mt-1" style={fieldStyle} />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={submitCall}
                  disabled={savingCall}
                  className="text-xs font-semibold px-3 py-2 rounded-lg"
                  style={{
                    color: callDraft.call_type === "checkin" ? "#38bdf8" : "#f59e0b",
                    background: callDraft.call_type === "checkin" ? "rgba(56,189,248,0.12)" : "rgba(245,158,11,0.12)",
                    border: callDraft.call_type === "checkin" ? "1px solid rgba(56,189,248,0.25)" : "1px solid rgba(245,158,11,0.25)",
                    opacity: savingCall ? 0.5 : 1,
                  }}
                >
                  {savingCall ? "Saving…" : callDraft.call_type === "checkin" ? "Save check-in" : "Add call"}
                </button>
              </div>
              )}

              {calls.length === 0 ? (
                <p className="text-sm py-4 text-center rounded-lg" style={{ color: "#334155", background: "#080f1e" }}>No account calls logged yet.</p>
              ) : (
                <div className="space-y-2">
                  {calls.map(call => (
                    <ClientCallCard
                      key={call.id}
                      call={call}
                      expanded={expandedCallIds.has(call.id)}
                      editing={editingCallId === call.id}
                      onToggleExpand={() => toggleCallExpanded(call.id)}
                      onStartEdit={() => setEditingCallId(call.id)}
                      onCancelEdit={() => setEditingCallId(null)}
                      onSave={form => saveCallEdit(call, form)}
                      onDelete={() => deleteCall(call.id)}
                    />
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="flex items-center justify-between gap-3 mb-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#cbd5e1" }}>
                  Client notes ({notes.length})
                </h3>
                <button
                  type="button"
                  onClick={() => setShowNoteComposer(s => !s)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap"
                  style={{ color: "#a78bfa", background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.25)" }}
                >
                  {showNoteComposer ? "Cancel" : "+ Add note"}
                </button>
              </div>

              {showNoteComposer && (
              <div className="rounded-lg p-4 mb-4 space-y-3" style={{ background: "#080f1e", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>Type</span>
                    <select value={noteType} disabled={savingNote} onChange={e => setNoteType(e.target.value)} className="mt-1 cursor-pointer" style={fieldStyle}>
                      {NOTE_TYPE_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>Related reason (optional)</span>
                    <select value={noteReason} disabled={savingNote} onChange={e => setNoteReason(e.target.value)} className="mt-1 cursor-pointer" style={fieldStyle}>
                      <option value="">None</option>
                      {LIFECYCLE_REASON_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="block">
                  <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>Note</span>
                  <textarea
                    value={noteBody}
                    disabled={savingNote}
                    onChange={e => setNoteBody(e.target.value)}
                    rows={3}
                    placeholder="Wins, concerns, call summaries, context for future analysis…"
                    className="mt-1 resize-y"
                    style={fieldStyle}
                  />
                </label>
                <button
                  type="button"
                  onClick={submitNote}
                  disabled={savingNote || !noteBody.trim()}
                  className="text-xs font-semibold px-3 py-2 rounded-lg"
                  style={{
                    color: "#a78bfa",
                    background: "rgba(167,139,250,0.12)",
                    border: "1px solid rgba(167,139,250,0.25)",
                    opacity: savingNote || !noteBody.trim() ? 0.5 : 1,
                  }}
                >
                  {savingNote ? "Saving…" : "Add note"}
                </button>
              </div>
              )}

              {notes.length === 0 ? (
                <p className="text-sm py-4 text-center rounded-lg" style={{ color: "#334155", background: "#080f1e" }}>No notes yet.</p>
              ) : (
                <div className="space-y-2">
                  {notes.map(n => (
                    editingNoteId === n.id ? (
                      <div
                        key={n.id}
                        className="rounded-lg px-4 py-3 space-y-3"
                        style={{ background: "#080f1e", border: "1px solid rgba(167,139,250,0.2)" }}
                      >
                        <div className="grid grid-cols-2 gap-3">
                          <select value={editNoteType} disabled={savingNoteEdit} onChange={e => setEditNoteType(e.target.value)} className="cursor-pointer" style={fieldStyle}>
                            {NOTE_TYPE_OPTIONS.map(o => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                          <select value={editNoteReason} disabled={savingNoteEdit} onChange={e => setEditNoteReason(e.target.value)} className="cursor-pointer" style={fieldStyle}>
                            <option value="">No reason</option>
                            {LIFECYCLE_REASON_OPTIONS.map(o => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        </div>
                        <textarea value={editNoteBody} disabled={savingNoteEdit} onChange={e => setEditNoteBody(e.target.value)} rows={3} className="resize-y" style={fieldStyle} />
                        <div className="flex gap-2">
                          <button type="button" disabled={savingNoteEdit} onClick={() => saveNoteEdit(n.id)} className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ color: "#a78bfa", background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.25)" }}>
                            {savingNoteEdit ? "Saving…" : "Save"}
                          </button>
                          <button type="button" disabled={savingNoteEdit} onClick={() => setEditingNoteId(null)} className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ color: "#94a3b8", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        key={n.id}
                        className="rounded-lg px-4 py-3"
                        style={{ background: "#080f1e", border: "1px solid rgba(255,255,255,0.06)" }}
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#a78bfa" }}>
                            {noteTypeLabel(n.note_type)}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs" style={{ color: "#475569" }}>
                              {formatDateTime(n.created_at)}
                              {n.created_by_label ? ` · ${n.created_by_label}` : ""}
                              {n.updated_at && n.updated_at !== n.created_at ? " (edited)" : ""}
                            </span>
                            <button type="button" onClick={() => startNoteEdit(n)} className="text-xs font-semibold" style={{ color: "#a78bfa" }}>Edit</button>
                            <button type="button" onClick={() => deleteNote(n.id)} className="text-xs font-semibold" style={{ color: "#64748b" }}>Remove</button>
                          </div>
                        </div>
                        {n.reason_code && (
                          <p className="text-xs mt-1" style={{ color: "#64748b" }}>{reasonLabel(n.reason_code)}</p>
                        )}
                        <p className="text-sm mt-1.5 whitespace-pre-wrap" style={{ color: "#cbd5e1" }}>{n.body}</p>
                      </div>
                    )
                  ))}
                </div>
              )}
            </section>
            </div>
            )}

            {activeTab === "billing" && (
            <div className="space-y-7">
            <Section title={`Billing history (${summary.count})`}>
              {canViewRevenue && (
                <div className="flex gap-3 flex-wrap mb-4">
                  <Chip label="Total collected" value={money(summary.collected)} color="#38bdf8" />
                  <Chip label="Retainer" value={money(summary.retainer)} color="#22c55e" />
                  <Chip label="Performance" value={money(summary.performance)} color="#a78bfa" />
                  {summary.passthrough > 0 && <Chip label="Passthrough" value={money(summary.passthrough)} color="#64748b" />}
                  <Chip label="Last payment" value={summary.lastPaidOn ?? "—"} color="#cbd5e1" />
                </div>
              )}

              {billings.length === 0 ? (
                <p className="text-sm py-6 text-center" style={{ color: "#334155" }}>No billings logged for this client yet.</p>
              ) : (
                <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ background: "#0a1628" }}>
                        {(canViewRevenue
                          ? ["Date", "Type", "Cash", "Amount", "Status", "Method"]
                          : ["Date", "Type", "Status", "Method"]
                        ).map((h, i) => (
                          <th key={i} className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: "#334155" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {billings.map((b, i) => {
                        const st = STATUS_STYLE[b.status] ?? STATUS_STYLE.pending;
                        const isPassthrough = b.revenue_type === "passthrough";
                        const cash = isPassthrough ? Number(b.passthrough_amount) || 0 : Number(b.amount_paid) || 0;
                        const typeLabel = b.revenue_type ? REVENUE_TYPE_LABEL[b.revenue_type] ?? b.revenue_type : "—";
                        const seg = b.revenue_segment === "front_end" ? "new" : b.revenue_segment === "back_end" ? "recurring" : null;
                        return (
                          <tr key={b.id} style={{ background: i % 2 === 0 ? "#080f1e" : "#060d1a", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                            <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "#cbd5e1" }}>
                              {b.paid_on ?? b.billed_on}
                              {b.note && <div className="text-xs mt-0.5" style={{ color: "#334155" }}>{b.note}</div>}
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              <span style={{ color: "#e2e8f0" }}>{typeLabel}</span>
                              {seg && <span className="ml-1.5 text-xs" style={{ color: "#475569" }}>· {seg}</span>}
                              {b.lead_source && <div className="text-xs mt-0.5" style={{ color: "#475569" }}>{b.lead_source}</div>}
                            </td>
                            {canViewRevenue && (
                              <>
                                <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: isPassthrough ? "#64748b" : "#38bdf8" }}>{money(cash)}</td>
                                <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "#e2e8f0" }}>{money(b.amount)}</td>
                              </>
                            )}
                            <td className="px-3 py-2.5"><span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ color: st.color, background: st.bg }}>{b.status}</span></td>
                            <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "#94a3b8" }}>{b.method ?? "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {!canViewRevenue && billings.length > 0 && (
                <p className="text-xs mt-3" style={{ color: "#475569" }}>Dollar amounts are hidden. Ask the account owner to grant &ldquo;View client revenue &amp; billing totals&rdquo; if you need them.</p>
              )}
            </Section>
            </div>
            )}
          </div>
        )}
      </div>
    </div>
    </>
  );
}

function billingTypeLabel(t: string | null | undefined): string {
  if (!t) return "Monthly (default)";
  if (t === "pif") return "PIF";
  if (t === "pif_monthly") return "PIF + Monthly";
  return "Monthly";
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "#cbd5e1" }}>{title}</h3>
      {children}
    </section>
  );
}

function Detail({ label, value, wide, missing }: { label: string; value: ReactNode; wide?: boolean; missing?: boolean }) {
  const display = value === null || value === undefined || value === "" || value === "—" ? "—" : value;
  return (
    <div className={wide ? "col-span-2 md:col-span-3" : undefined}>
      <p className="text-xs uppercase tracking-wider mb-0.5" style={{ color: missing ? "#f59e0b" : "#475569" }}>{label}{missing ? " · missing" : ""}</p>
      <p className="text-sm" style={{ color: display === "—" ? "#334155" : "#e2e8f0" }}>{display}</p>
    </div>
  );
}

function Chip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.06)" }}>
      <p className="text-xs uppercase tracking-wider" style={{ color: "#475569" }}>{label}</p>
      <p className="text-base font-bold" style={{ color }}>{value}</p>
    </div>
  );
}

function ClientCallCard({
  call,
  expanded,
  editing,
  onToggleExpand,
  onStartEdit,
  onCancelEdit,
  onSave,
  onDelete,
}: {
  call: ClientCall;
  expanded: boolean;
  editing: boolean;
  onToggleExpand: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (form: {
    call_type: string;
    called_at: string;
    recording_url: string;
    transcript: string;
    notes: string;
    attendees: string;
    checkin_form: CheckinFormData;
    duration_seconds: string;
    disposition: string;
    follow_up_due_at: string;
  }) => Promise<boolean>;
  onDelete: () => void;
}) {
  const [form, setForm] = useState({
    call_type: call.call_type,
    called_at: toDatetimeLocal(call.called_at),
    recording_url: call.recording_url ?? "",
    transcript: call.transcript ?? "",
    notes: call.notes ?? "",
    attendees: call.attendees ?? "",
    checkin_form: storedToDraft(call.checkin_form),
    duration_seconds: call.duration_seconds != null ? String(call.duration_seconds) : "",
    disposition: call.disposition ?? "",
    follow_up_due_at: call.follow_up_due_at ? toDatetimeLocal(call.follow_up_due_at) : "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      setForm({
        call_type: call.call_type,
        called_at: toDatetimeLocal(call.called_at),
        recording_url: call.recording_url ?? "",
        transcript: call.transcript ?? "",
        notes: call.notes ?? "",
        attendees: call.attendees ?? "",
        checkin_form: storedToDraft(call.checkin_form),
        duration_seconds: call.duration_seconds != null ? String(call.duration_seconds) : "",
        disposition: call.disposition ?? "",
        follow_up_due_at: call.follow_up_due_at ? toDatetimeLocal(call.follow_up_due_at) : "",
      });
    }
  }, [editing, call]);

  async function handleSave() {
    setSaving(true);
    await onSave(form);
    setSaving(false);
  }

  const hasDetails = !!(call.transcript || call.notes || call.attendees);

  if (editing) {
    return (
      <div className="rounded-lg px-4 py-3 space-y-3" style={{ background: "#080f1e", border: "1px solid rgba(245,158,11,0.2)" }}>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>Type</span>
            <select
              value={form.call_type}
              disabled={saving}
              onChange={e => setForm(f => ({ ...f, call_type: e.target.value }))}
              className="mt-1 cursor-pointer"
              style={fieldStyle}
            >
              {CALL_TYPE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>Call date</span>
            <input
              type="datetime-local"
              value={form.called_at}
              disabled={saving}
              onChange={e => setForm(f => ({ ...f, called_at: e.target.value }))}
              className="mt-1"
              style={fieldStyle}
            />
          </label>
        </div>
        <label className="block">
          <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>Recording URL</span>
          <input
            type="url"
            value={form.recording_url}
            disabled={saving}
            onChange={e => setForm(f => ({ ...f, recording_url: e.target.value }))}
            className="mt-1"
            style={fieldStyle}
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>Attendees</span>
          <input
            value={form.attendees}
            disabled={saving}
            onChange={e => setForm(f => ({ ...f, attendees: e.target.value }))}
            className="mt-1"
            style={fieldStyle}
          />
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label className="block">
            <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>Duration (sec)</span>
            <input type="number" min={0} value={form.duration_seconds} disabled={saving} onChange={e => setForm(f => ({ ...f, duration_seconds: e.target.value }))} className="mt-1" style={fieldStyle} />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>Disposition</span>
            <select value={form.disposition} disabled={saving} onChange={e => setForm(f => ({ ...f, disposition: e.target.value }))} className="mt-1 cursor-pointer" style={fieldStyle}>
              <option value="">None</option>
              {CALL_DISPOSITION_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>Follow-up due</span>
            <input type="datetime-local" value={form.follow_up_due_at} disabled={saving} onChange={e => setForm(f => ({ ...f, follow_up_due_at: e.target.value }))} className="mt-1" style={fieldStyle} />
          </label>
        </div>
        {form.call_type === "checkin" && (
          <CheckinCallFormFields
            value={form.checkin_form}
            disabled={saving}
            onChange={checkin_form => setForm(f => ({ ...f, checkin_form }))}
          />
        )}
        <label className="block">
          <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>Transcript</span>
          <textarea
            value={form.transcript}
            disabled={saving}
            onChange={e => setForm(f => ({ ...f, transcript: e.target.value }))}
            rows={5}
            className="mt-1 resize-y"
            style={fieldStyle}
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>Notes</span>
          <textarea
            value={form.notes}
            disabled={saving}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            rows={3}
            className="mt-1 resize-y"
            style={fieldStyle}
          />
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg"
            style={{ color: "#f59e0b", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.25)" }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onCancelEdit}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg"
            style={{ color: "#94a3b8", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg px-4 py-3" style={{ background: "#080f1e", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#f59e0b" }}>
            {callTypeLabel(call.call_type)}
          </span>
          {call.recording_url && (
            <a
              href={call.recording_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold"
              style={{ color: "#38bdf8" }}
            >
              Recording ↗
            </a>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs whitespace-nowrap" style={{ color: "#475569" }}>
            {formatDateTime(call.called_at)}
            {call.created_by_label ? ` · ${call.created_by_label}` : ""}
          </span>
          <button type="button" onClick={onStartEdit} className="text-xs font-semibold" style={{ color: "#a78bfa" }}>Edit</button>
          <button type="button" onClick={onDelete} className="text-xs font-semibold" style={{ color: "#64748b" }}>Remove</button>
        </div>
      </div>
      {(call.duration_seconds != null || call.disposition || call.follow_up_due_at) && (
        <p className="text-xs mt-1.5 flex flex-wrap gap-x-3" style={{ color: "#64748b" }}>
          {call.duration_seconds != null && <span>{call.duration_seconds}s</span>}
          {call.disposition && <span>{dispositionLabel(call.disposition)}</span>}
          {call.follow_up_due_at && <span>Follow-up {formatDateTime(call.follow_up_due_at)}</span>}
        </p>
      )}
      {call.attendees && (
        <p className="text-xs mt-1.5" style={{ color: "#64748b" }}>Attendees: {call.attendees}</p>
      )}
      {call.call_type === "checkin" && call.checkin_form && (
        <CheckinCallSummary form={call.checkin_form} />
      )}
      {call.notes && (
        <p className="text-sm mt-1.5 whitespace-pre-wrap" style={{ color: "#cbd5e1" }}>{call.notes}</p>
      )}
      {call.transcript && (
        <div className="mt-2">
          <button
            type="button"
            onClick={onToggleExpand}
            className="text-xs font-semibold"
            style={{ color: "#64748b" }}
          >
            {expanded ? "Hide transcript" : "Show transcript"}
          </button>
          {expanded && (
            <p className="text-sm mt-1.5 whitespace-pre-wrap max-h-64 overflow-y-auto" style={{ color: "#94a3b8" }}>
              {call.transcript}
            </p>
          )}
          {!expanded && hasDetails && !call.notes && (
            <p className="text-xs mt-1 truncate" style={{ color: "#475569" }}>
              {call.transcript.slice(0, 140)}{call.transcript.length > 140 ? "…" : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

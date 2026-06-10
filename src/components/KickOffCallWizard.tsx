"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import StatesLicensedSelect from "@/components/StatesLicensedSelect";
import TimezoneSelect from "@/components/TimezoneSelect";
import {
  CONTACT_ROLE_OPTIONS,
  kickoffDraftFromClient,
  kickoffDraftToBody,
  type KickoffClient,
  type KickoffDraft,
} from "@/lib/kickoff";

type Props = {
  clientId: string;
  fallbackName: string;
  onClose: () => void;
  onCompleted?: () => void;
};

function fieldStyle(shareMode: boolean, prefilled = false): CSSProperties {
  if (shareMode) {
    return {
      background: prefilled ? "#f0fdf4" : "#ffffff",
      border: prefilled ? "1px solid #86efac" : "1px solid #d1d5db",
      color: "#111827",
    };
  }
  return {
    background: prefilled ? "#0f2a1a" : "#0f2040",
    border: prefilled ? "1px solid rgba(34,197,94,0.35)" : "1px solid rgba(255,255,255,0.12)",
    color: "#e2e8f0",
  };
}

function labelColor(shareMode: boolean): string {
  return shareMode ? "#374151" : "#475569";
}

function sectionTitleColor(shareMode: boolean): string {
  return shareMode ? "#111827" : "#cbd5e1";
}

function helperColor(shareMode: boolean): string {
  return shareMode ? "#6b7280" : "#64748b";
}

function hasValue(v: string | string[] | undefined | null): boolean {
  if (Array.isArray(v)) return v.length > 0;
  return !!v?.trim();
}

export default function KickOffCallWizard({ clientId, fallbackName, onClose, onCompleted }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [shareMode, setShareMode] = useState(true);
  const [clientName, setClientName] = useState(fallbackName);
  const [canViewRevenue, setCanViewRevenue] = useState(false);
  const [draft, setDraft] = useState<KickoffDraft | null>(null);
  const [initialSnapshot, setInitialSnapshot] = useState<KickoffDraft | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/clients/${clientId}/kickoff`);
      const data = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (!res.ok) {
        setError(data.error ?? "Failed to load kick-off data");
        setLoading(false);
        return;
      }
      const c = data.client as KickoffClient;
      const recording = data.onboarding_call?.recording_url ?? "";
      const nextDraft = kickoffDraftFromClient(c, recording);
      setClientName(c.name || fallbackName);
      setCanViewRevenue(!!data.can_view_revenue);
      setDraft(nextDraft);
      setInitialSnapshot(nextDraft);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [clientId, fallbackName]);

  function patch<K extends keyof KickoffDraft>(key: K, value: KickoffDraft[K]) {
    setDraft(prev => (prev ? { ...prev, [key]: value } : prev));
    setSaveError(null);
  }

  function prefilled(key: keyof KickoffDraft): boolean {
    if (!initialSnapshot || !draft) return false;
    const initial = initialSnapshot[key];
    const current = draft[key];
    if (Array.isArray(initial) && Array.isArray(current)) {
      return initial.length > 0 && JSON.stringify(initial) === JSON.stringify(current);
    }
    return hasValue(initial as string) && initial === current;
  }

  async function submit() {
    if (!draft) return;
    if (shareMode) {
      setSaveError("Turn off Share Mode to fill in post-call fields before completing.");
      return;
    }
    if (!draft.ghl_location_id.trim()) {
      setSaveError("Client GHL Location ID is required.");
      return;
    }
    if (!draft.recording_url.trim()) {
      setSaveError("OB call recording link is required.");
      return;
    }

    setSaving(true);
    setSaveError(null);
    const res = await fetch(`/api/clients/${clientId}/kickoff`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(kickoffDraftToBody(draft, canViewRevenue)),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setSaveError(data.error ?? "Failed to save kick-off");
      setSaving(false);
      return;
    }
    setSaving(false);
    onCompleted?.();
    onClose();
  }

  const shellBg = shareMode ? "#f9fafb" : "#060d1a";
  const headerBg = shareMode ? "#ffffff" : "#0a1628";
  const borderColor = shareMode ? "#e5e7eb" : "rgba(255,255,255,0.08)";
  const titleColor = shareMode ? "#111827" : "#e2e8f0";
  const subtitleColor = shareMode ? "#6b7280" : "#475569";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto py-6 px-4"
      style={{ background: shareMode ? "rgba(249,250,251,0.98)" : "rgba(2,6,15,0.85)" }}
      onClick={onClose}
    >
      <div
        className="w-full rounded-xl shadow-2xl overflow-hidden"
        style={{ maxWidth: 640, background: shellBg, border: `1px solid ${borderColor}` }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="px-6 py-4 flex items-start justify-between gap-4 sticky top-0 z-10"
          style={{ background: headerBg, borderBottom: `1px solid ${borderColor}` }}
        >
          <div>
            <h2 className="text-lg font-semibold" style={{ color: titleColor }}>
              Kick-Off Call
            </h2>
            <p className="text-sm mt-0.5" style={{ color: subtitleColor }}>
              {clientName} — confirm details with the client, then complete post-call fields.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0"
            style={{
              color: shareMode ? "#374151" : "#94a3b8",
              background: shareMode ? "#f3f4f6" : "rgba(255,255,255,0.05)",
              border: `1px solid ${borderColor}`,
            }}
          >
            Close
          </button>
        </div>

        <div className="px-6 py-4" style={{ borderBottom: `1px solid ${borderColor}` }}>
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <div>
              <p className="text-sm font-semibold" style={{ color: titleColor }}>
                Sharing screen with client
              </p>
              <p className="text-xs mt-0.5" style={{ color: subtitleColor }}>
                When on, only client-safe fields are shown. Internal fields stay hidden.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={shareMode}
              onClick={() => setShareMode(v => !v)}
              className="relative inline-flex h-7 w-12 flex-shrink-0 rounded-full transition-colors"
              style={{ background: shareMode ? "#22c55e" : "#334155" }}
            >
              <span
                className="inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform mt-1"
                style={{ marginLeft: shareMode ? "1.375rem" : "0.25rem" }}
              />
            </button>
          </label>
        </div>

        {loading ? (
          <p className="text-sm py-16 text-center" style={{ color: subtitleColor }}>Loading…</p>
        ) : error ? (
          <p className="text-sm py-16 text-center px-6" style={{ color: "#ef4444" }}>{error}</p>
        ) : draft ? (
          <div className="px-6 py-6 space-y-8">
            <Section title="Confirm Information" shareMode={shareMode}>
              <div className="space-y-4">
                <Field
                  label="Phone"
                  required
                  shareMode={shareMode}
                  prefilled={prefilled("phone")}
                  helper="Primary contact number on file."
                >
                  <input
                    type="tel"
                    value={draft.phone}
                    disabled={saving}
                    onChange={e => patch("phone", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={fieldStyle(shareMode, prefilled("phone"))}
                  />
                </Field>
                <Field
                  label="What position best describes your role?"
                  shareMode={shareMode}
                  prefilled={prefilled("contact_role")}
                >
                  <select
                    value={draft.contact_role}
                    disabled={saving}
                    onChange={e => patch("contact_role", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none cursor-pointer"
                    style={fieldStyle(shareMode, prefilled("contact_role"))}
                  >
                    <option value="">Select…</option>
                    {CONTACT_ROLE_OPTIONS.map(o => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                    {draft.contact_role && !CONTACT_ROLE_OPTIONS.includes(draft.contact_role as typeof CONTACT_ROLE_OPTIONS[number]) && (
                      <option value={draft.contact_role}>{draft.contact_role}</option>
                    )}
                  </select>
                </Field>
                <Field
                  label="States Licensed"
                  shareMode={shareMode}
                  prefilled={prefilled("states_licensed")}
                >
                  <StatesLicensedSelect
                    value={draft.states_licensed}
                    disabled={saving}
                    onChange={codes => patch("states_licensed", codes)}
                    className="w-full"
                  />
                </Field>
                <Field label="NMLS #" shareMode={shareMode} prefilled={prefilled("nmls")}>
                  <input
                    value={draft.nmls}
                    disabled={saving}
                    onChange={e => patch("nmls", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none font-mono"
                    style={fieldStyle(shareMode, prefilled("nmls"))}
                  />
                </Field>
                <Field
                  label="Bank / Broker / Lender Working For"
                  shareMode={shareMode}
                  prefilled={prefilled("brokerage_name")}
                  helper="Wherever their license is hung up."
                >
                  <input
                    value={draft.brokerage_name}
                    disabled={saving}
                    onChange={e => patch("brokerage_name", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={fieldStyle(shareMode, prefilled("brokerage_name"))}
                  />
                </Field>
                <Field label="Current Timezone" shareMode={shareMode} prefilled={prefilled("timezone")}>
                  <TimezoneSelect
                    value={draft.timezone}
                    disabled={saving}
                    highlightEmpty
                    onChange={tz => patch("timezone", tz ?? "")}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                  />
                </Field>
              </div>
            </Section>

            <Section title="Get Information" shareMode={shareMode}>
              <div className="space-y-4">
                <Field
                  label="Appointment Length, Details & Buffer Time"
                  shareMode={shareMode}
                  prefilled={prefilled("appointment_settings")}
                  helper='Recommended: 15-min time slots, 30-min calls. Max availability to increase booking/show rate.'
                >
                  <input
                    value={draft.appointment_settings}
                    disabled={saving}
                    onChange={e => patch("appointment_settings", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={fieldStyle(shareMode, prefilled("appointment_settings"))}
                  />
                </Field>
                {canViewRevenue && (
                  <Field
                    label="Daily Adspend"
                    shareMode={shareMode}
                    prefilled={prefilled("daily_adspend")}
                    helper="Average starting point is $50–$100/day."
                  >
                    <div className="relative">
                      <span
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-sm"
                        style={{ color: helperColor(shareMode) }}
                      >
                        $
                      </span>
                      <input
                        type="number"
                        min={0}
                        value={draft.daily_adspend}
                        disabled={saving}
                        onChange={e => patch("daily_adspend", e.target.value)}
                        className="w-full pl-7 pr-3 py-2 rounded-lg text-sm outline-none"
                        style={fieldStyle(shareMode, prefilled("daily_adspend"))}
                      />
                    </div>
                  </Field>
                )}
                <Field
                  label="Facebook Page Name"
                  shareMode={shareMode}
                  prefilled={prefilled("facebook_page_name")}
                >
                  <input
                    value={draft.facebook_page_name}
                    disabled={saving}
                    onChange={e => patch("facebook_page_name", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={fieldStyle(shareMode, prefilled("facebook_page_name"))}
                  />
                </Field>
                <Field
                  label="Phone number to receive texts"
                  shareMode={shareMode}
                  prefilled={prefilled("phone_notifications")}
                  helper="Typically cell or Bonzo number."
                >
                  <input
                    type="tel"
                    value={draft.phone_notifications}
                    disabled={saving}
                    onChange={e => patch("phone_notifications", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={fieldStyle(shareMode, prefilled("phone_notifications"))}
                  />
                </Field>
                <Field
                  label="Phone Number to Receive Live Transfers (Ring Central)"
                  shareMode={shareMode}
                  prefilled={prefilled("phone_live_transfer")}
                >
                  <input
                    type="tel"
                    value={draft.phone_live_transfer}
                    disabled={saving}
                    onChange={e => patch("phone_live_transfer", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={fieldStyle(shareMode, prefilled("phone_live_transfer"))}
                  />
                </Field>
                <Field label="Live Transfer Approved?" shareMode={shareMode} prefilled={prefilled("live_transfer_approved")}>
                  <select
                    value={draft.live_transfer_approved}
                    disabled={saving}
                    onChange={e => patch("live_transfer_approved", e.target.value as KickoffDraft["live_transfer_approved"])}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none cursor-pointer"
                    style={fieldStyle(shareMode, prefilled("live_transfer_approved"))}
                  >
                    <option value="">Select…</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </Field>
              </div>
            </Section>

            {!shareMode && (
              <Section title="Post Call" shareMode={shareMode}>
                <div className="space-y-4">
                  <Field label="Client GHL Location ID" required shareMode={shareMode}>
                    <input
                      value={draft.ghl_location_id}
                      disabled={saving}
                      onChange={e => patch("ghl_location_id", e.target.value)}
                      placeholder="GHL subaccount location id"
                      className="w-full px-3 py-2 rounded-lg text-sm outline-none font-mono"
                      style={fieldStyle(shareMode)}
                    />
                  </Field>
                  <Field label="OB Call Recording Link" required shareMode={shareMode}>
                    <input
                      type="url"
                      value={draft.recording_url}
                      disabled={saving}
                      onChange={e => patch("recording_url", e.target.value)}
                      placeholder="https://…"
                      className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                      style={fieldStyle(shareMode)}
                    />
                  </Field>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.advance_lifecycle}
                      disabled={saving}
                      onChange={e => patch("advance_lifecycle", e.target.checked)}
                      className="mt-1"
                    />
                    <span className="text-sm" style={{ color: labelColor(shareMode) }}>
                      Move lifecycle from <strong>new account</strong> to <strong>onboarding</strong> when saved
                    </span>
                  </label>
                </div>
              </Section>
            )}

            {shareMode && (
              <p className="text-sm rounded-lg px-4 py-3" style={{ color: subtitleColor, background: shareMode ? "#eff6ff" : "#0f2040", border: `1px solid ${shareMode ? "#bfdbfe" : "rgba(255,255,255,0.08)"}` }}>
                Post-call fields (GHL Location ID, recording link) appear when Share Mode is off.
              </p>
            )}

            {saveError && (
              <p className="text-sm rounded-lg px-4 py-3" style={{ color: "#ef4444", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
                {saveError}
              </p>
            )}

            {!shareMode && (
              <button
                type="button"
                onClick={submit}
                disabled={saving}
                className="w-full text-sm font-semibold px-4 py-3 rounded-lg"
                style={{
                  color: "#ffffff",
                  background: "#2563eb",
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? "Saving…" : "Complete Kick-Off"}
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Section({ title, shareMode, children }: { title: string; shareMode: boolean; children: ReactNode }) {
  return (
    <section>
      <h3
        className="text-base font-semibold mb-4 pb-2"
        style={{ color: sectionTitleColor(shareMode), borderBottom: `1px solid ${shareMode ? "#e5e7eb" : "rgba(255,255,255,0.06)"}` }}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({
  label,
  required,
  shareMode,
  prefilled,
  helper,
  children,
}: {
  label: string;
  required?: boolean;
  shareMode: boolean;
  prefilled?: boolean;
  helper?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium" style={{ color: labelColor(shareMode) }}>
        {label}
        {required && <span style={{ color: "#ef4444" }}> *</span>}
        {prefilled && (
          <span className="ml-2 text-xs font-normal" style={{ color: "#22c55e" }}>on file</span>
        )}
      </span>
      <div className="mt-1.5">{children}</div>
      {helper && (
        <p className="text-xs mt-1.5" style={{ color: helperColor(shareMode) }}>{helper}</p>
      )}
    </label>
  );
}

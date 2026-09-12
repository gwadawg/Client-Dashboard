"use client";

import { useEffect, useMemo, useState } from "react";
import ReportingTypeBadge, { ServiceProgramBadge } from "@/components/ReportingTypeBadge";
import {
  emptyLaunchKitDraft,
  LAUNCH_KIT_PROPERTIES,
  resolveVariant,
  validateForGenerate,
  type LaunchKitDraft,
  type LaunchKitPropertyKey,
} from "@/lib/launch-kit/intake";
import type { LaunchKitVersionRow } from "@/lib/launch-kit/storage";
import { KIT_DIAL_OWNER_LABELS, KIT_PRODUCT_LABELS, type KitDialOwner, type KitProduct } from "@/lib/launch-kit/types";

type Props = {
  clientId: string;
  fallbackName: string;
  onClose: () => void;
  onGenerated?: () => void;
};

type LoadResponse = {
  client: {
    id: string;
    name: string;
    lifecycle_status: string | null;
    slack_id: string | null;
    reporting_type: string | null;
    service_program: string | null;
    drive_folder_url: string | null;
  };
  kickoff_complete: boolean;
  lifecycle_ok: boolean;
  draft: LaunchKitDraft;
  prefill_source: string | null;
  versions: LaunchKitVersionRow[];
  template_version: string;
};

type Step = "variant" | "live" | "operator" | "review";
const STEPS: { id: Step; label: string }[] = [
  { id: "variant", label: "Variant" },
  { id: "live", label: "What's live" },
  { id: "operator", label: "Operator setup" },
  { id: "review", label: "Review & generate" },
];

const fieldStyle = {
  background: "#0f2040",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#e2e8f0",
};

const panelStyle = { border: "1px solid rgba(255,255,255,0.08)", background: "#0a1628" };

export default function LaunchKitWizard({ clientId, fallbackName, onClose, onGenerated }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<"draft" | "generate" | "send" | null>(null);
  const [data, setData] = useState<LoadResponse | null>(null);
  const [draft, setDraft] = useState<LaunchKitDraft>(emptyLaunchKitDraft());
  const [step, setStep] = useState<Step>("variant");
  const [sendingId, setSendingId] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/clients/${clientId}/launch-kit`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? "Failed to load Launch Kit");
      setLoading(false);
      return;
    }
    setData(json as LoadResponse);
    setDraft((json as LoadResponse).draft);
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/clients/${clientId}/launch-kit`);
      const json = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (!res.ok) {
        setError(json.error ?? "Failed to load Launch Kit");
        setLoading(false);
        return;
      }
      setData(json as LoadResponse);
      setDraft((json as LoadResponse).draft);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  const variant = useMemo(() => resolveVariant(draft), [draft]);
  const errors = useMemo(() => validateForGenerate(draft), [draft]);
  const kickoffComplete = data?.kickoff_complete ?? true;
  const lifecycleOk = data?.lifecycle_ok ?? true;
  const canGenerate = !!data && kickoffComplete && lifecycleOk && errors.length === 0 && busy === null;
  const clientName = data?.client.name ?? fallbackName;

  function patch<K extends keyof LaunchKitDraft>(key: K, value: LaunchKitDraft[K]) {
    setDraft(prev => ({ ...prev, [key]: value }));
    setSaveError(null);
    setNotice(null);
  }

  function toggleNa(key: LaunchKitPropertyKey, na: boolean) {
    setDraft(prev => ({ ...prev, property_na: { ...prev.property_na, [key]: na || undefined } }));
    setSaveError(null);
  }

  async function saveDraft() {
    setBusy("draft");
    setSaveError(null);
    const res = await fetch(`/api/clients/${clientId}/launch-kit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "draft", draft }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setSaveError(json.error ?? "Failed to save draft");
      return;
    }
    setNotice("Draft saved. Reopen this wizard any time to continue.");
  }

  async function generate() {
    if (!canGenerate) {
      setSaveError(errors[0] ?? "Fix the items above before generating.");
      return;
    }
    setBusy("generate");
    setSaveError(null);
    const res = await fetch(`/api/clients/${clientId}/launch-kit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "generate", draft }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setSaveError(json.error ?? "Failed to generate Launch Kit");
      return;
    }
    setNotice(`Launch Kit v${json.version} generated. Ops channel notified. Upload it to the client Drive folder, then send to the client channel on the Launch Call.`);
    onGenerated?.();
    if (json.download_url) window.open(json.download_url, "_blank", "noopener");
    await load();
    setStep("review");
  }

  async function sendToClient(submissionId: string) {
    setBusy("send");
    setSendingId(submissionId);
    setSaveError(null);
    const res = await fetch(`/api/clients/${clientId}/launch-kit/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submission_id: submissionId }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    setSendingId(null);
    if (!res.ok) {
      setSaveError(json.error ?? "Failed to send to client channel");
      return;
    }
    setNotice("Posted to the client Slack channel.");
    await load();
  }

  const stepIndex = STEPS.findIndex(s => s.id === step);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto py-6 px-4"
      style={{ background: "rgba(2,6,15,0.85)" }}
    >
      <div
        className="w-full rounded-xl shadow-2xl overflow-hidden"
        style={{ maxWidth: 720, background: "#060d1a", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div className="px-6 py-4 flex items-start justify-between gap-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold text-slate-200">Launch Kit</h2>
              {data?.client.reporting_type && <ReportingTypeBadge value={data.client.reporting_type} size="sm" />}
              {data?.client.service_program && <ServiceProgramBadge value={data.client.service_program} size="sm" />}
            </div>
            <p className="text-sm mt-0.5 text-slate-500">
              {clientName}
              {variant ? ` — ${KIT_PRODUCT_LABELS[variant.product]} · ${variant.dialOwner === "waiz" ? "Waiz works leads" : "Client works leads"}` : ""}
            </p>
            {data && (
              <p className="text-xs mt-1 text-slate-500">
                {data.versions.length ? `${data.versions.length} version${data.versions.length === 1 ? "" : "s"} on file` : "No kit generated yet"}
                {" · "}template {data.template_version}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-slate-400 border border-white/10">
            Close
          </button>
        </div>

        {!loading && !error && (
          <div className="px-6 pt-4 flex items-center gap-1 flex-wrap">
            {STEPS.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStep(s.id)}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-md"
                style={{
                  color: s.id === step ? "#e2e8f0" : i < stepIndex ? "#86efac" : "#64748b",
                  background: s.id === step ? "rgba(79,163,255,0.18)" : "rgba(255,255,255,0.03)",
                  border: s.id === step ? "1px solid rgba(79,163,255,0.4)" : "1px solid rgba(255,255,255,0.06)",
                }}
              >
                {i + 1}. {s.label}
              </button>
            ))}
          </div>
        )}

        <div className="px-6 py-5 space-y-5 max-h-[68vh] overflow-y-auto">
          {loading ? (
            <p className="text-sm text-slate-500 text-center py-8">Loading…</p>
          ) : error ? (
            <p className="text-sm text-red-400 text-center py-8">{error}</p>
          ) : (
            <>
              {!kickoffComplete && (
                <Banner tone="warn">Kick-off is not complete yet (GHL mapping + OB recording required). You can save a draft, but not generate.</Banner>
              )}
              {!lifecycleOk && (
                <Banner tone="warn">Launch Kit is only available for clients in new account, onboarding, or active status.</Banner>
              )}
              {data?.prefill_source === "draft" && step === "variant" && (
                <Banner tone="info">Resumed from your saved draft.</Banner>
              )}

              {step === "variant" && <VariantStep draft={draft} patch={patch} />}
              {step === "live" && <LiveStep draft={draft} patch={patch} toggleNa={toggleNa} driveFolderUrl={data?.client.drive_folder_url ?? null} />}
              {step === "operator" && <OperatorStep draft={draft} patch={patch} />}
              {step === "review" && (
                <ReviewStep
                  draft={draft}
                  errors={errors}
                  versions={data?.versions ?? []}
                  clientId={clientId}
                  hasSlack={!!data?.client.slack_id}
                  busy={busy}
                  sendingId={sendingId}
                  onSend={sendToClient}
                />
              )}
            </>
          )}

          {notice && <Banner tone="ok">{notice}</Banner>}
          {saveError && (
            <p className="text-sm rounded-lg px-4 py-3 text-red-400 bg-red-950/40 border border-red-500/30">{saveError}</p>
          )}
        </div>

        {!loading && !error && (
          <div className="px-6 pb-6 flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setStep(STEPS[Math.max(0, stepIndex - 1)].id)}
              disabled={stepIndex === 0}
              className="text-sm font-semibold px-4 py-2.5 rounded-lg text-slate-300 border border-white/10 disabled:opacity-40"
            >
              Back
            </button>
            {step !== "review" ? (
              <button
                type="button"
                onClick={() => setStep(STEPS[stepIndex + 1].id)}
                className="text-sm font-semibold px-4 py-2.5 rounded-lg text-white"
                style={{ background: "#1d4ed8" }}
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                onClick={generate}
                disabled={!canGenerate}
                className="text-sm font-semibold px-4 py-2.5 rounded-lg text-white"
                style={{ background: !canGenerate ? "#334155" : "#16a34a" }}
              >
                {busy === "generate" ? "Generating…" : data?.versions.length ? `Generate v${data.versions.length + 1}` : "Generate PDF"}
              </button>
            )}
            <button
              type="button"
              onClick={saveDraft}
              disabled={busy !== null}
              className="ml-auto text-sm font-semibold px-4 py-2.5 rounded-lg text-slate-300 border border-white/10 disabled:opacity-40"
            >
              {busy === "draft" ? "Saving…" : "Save draft"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Banner({ tone, children }: { tone: "warn" | "info" | "ok"; children: React.ReactNode }) {
  const styles = {
    warn: "text-amber-300 bg-amber-950/40 border-amber-500/30",
    info: "text-sky-300 bg-sky-950/40 border-sky-500/30",
    ok: "text-emerald-300 bg-emerald-950/40 border-emerald-500/30",
  }[tone];
  return <p className={`text-sm rounded-lg px-4 py-3 border ${styles}`}>{children}</p>;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-400">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`w-full px-3 py-2 rounded-lg text-sm outline-none ${props.className ?? ""}`} style={fieldStyle} />;
}

type PatchFn = <K extends keyof LaunchKitDraft>(key: K, value: LaunchKitDraft[K]) => void;

function VariantStep({ draft, patch }: { draft: LaunchKitDraft; patch: PatchFn }) {
  return (
    <section className="rounded-lg overflow-hidden" style={panelStyle}>
      <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <h3 className="text-sm font-semibold text-slate-200">Confirm the variant</h3>
        <p className="text-xs mt-0.5 text-slate-500">
          Prefilled from the client file. Product picks the resource index; who works leads picks the Week 1 page.
        </p>
      </div>
      <div className="px-4 py-4 space-y-4">
        <ChoiceGroup<KitProduct>
          label="Product"
          value={draft.product}
          options={(Object.keys(KIT_PRODUCT_LABELS) as KitProduct[]).map(k => ({ value: k, label: KIT_PRODUCT_LABELS[k] }))}
          onChange={v => patch("product", v)}
        />
        <ChoiceGroup<KitDialOwner>
          label="Who works new leads"
          value={draft.dial_owner}
          options={(Object.keys(KIT_DIAL_OWNER_LABELS) as KitDialOwner[]).map(k => ({ value: k, label: KIT_DIAL_OWNER_LABELS[k] }))}
          onChange={v => patch("dial_owner", v)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contact first name" hint="Used in the greeting: “Jordan — your account is ready.”">
            <TextInput value={draft.contact_first_name} onChange={e => patch("contact_first_name", e.target.value)} />
          </Field>
          <Field label="Company / DBA" hint="Cover subtitle and footer.">
            <TextInput value={draft.company_name} onChange={e => patch("company_name", e.target.value)} />
          </Field>
          <Field label="Go-live date">
            <TextInput type="date" value={draft.go_live_date} onChange={e => patch("go_live_date", e.target.value)} />
          </Field>
          <Field label="Market / geo" hint="States or metro, as sold.">
            <TextInput value={draft.market} onChange={e => patch("market", e.target.value)} placeholder="Florida" />
          </Field>
        </div>
      </div>
    </section>
  );
}

function ChoiceGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | "";
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      <span className="text-sm font-medium text-slate-400">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map(o => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className="text-sm px-3 py-2 rounded-lg text-left"
              style={{
                color: active ? "#e2e8f0" : "#94a3b8",
                background: active ? "rgba(79,163,255,0.18)" : "#0f2040",
                border: active ? "1px solid rgba(79,163,255,0.5)" : "1px solid rgba(255,255,255,0.12)",
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LiveStep({
  draft,
  patch,
  toggleNa,
  driveFolderUrl,
}: {
  draft: LaunchKitDraft;
  patch: PatchFn;
  toggleNa: (key: LaunchKitPropertyKey, na: boolean) => void;
  driveFolderUrl: string | null;
}) {
  return (
    <section className="rounded-lg overflow-hidden" style={panelStyle}>
      <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <h3 className="text-sm font-semibold text-slate-200">What&apos;s live</h3>
        <p className="text-xs mt-0.5 text-slate-500">
          Every URL here is clicked on the Launch Call. Fill it or mark N/A — never ship a guessed link. Funnel and CRM write back to the client file.
        </p>
      </div>
      <div className="px-4 py-4 space-y-4">
        {LAUNCH_KIT_PROPERTIES.map(p => {
          const na = draft.property_na[p.key] === true;
          return (
            <div key={p.key} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-slate-400">{p.label}</span>
                {p.naAllowed && (
                  <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
                    <input type="checkbox" checked={na} onChange={e => toggleNa(p.key, e.target.checked)} />
                    Not part of this account
                  </label>
                )}
              </div>
              <TextInput
                type="url"
                value={draft[p.key]}
                disabled={na}
                onChange={e => patch(p.key, e.target.value)}
                placeholder="https://…"
                className={na ? "opacity-40" : ""}
              />
              {p.key === "launch_kit_folder_url" && (
                <p className="text-xs text-slate-500">
                  The client&apos;s <code>Launch Kit/</code> Drive folder (01-Launch-PDF, 02-Links, 03-Swipe-and-Ads, 04-Recordings).
                  {driveFolderUrl && !draft.launch_kit_folder_url && (
                    <>
                      {" "}Client Drive root:{" "}
                      <button type="button" className="underline text-sky-300" onClick={() => patch("launch_kit_folder_url", driveFolderUrl)}>
                        use root folder
                      </button>
                    </>
                  )}
                </p>
              )}
            </div>
          );
        })}
        <Field label="Slack channel name" hint="Shown in the PDF as the default channel (e.g. #hale-capital). Optional.">
          <TextInput value={draft.slack_channel_name} onChange={e => patch("slack_channel_name", e.target.value)} placeholder="#client-channel" />
        </Field>
      </div>
    </section>
  );
}

function OperatorStep({ draft, patch }: { draft: LaunchKitDraft; patch: PatchFn }) {
  return (
    <section className="rounded-lg overflow-hidden" style={panelStyle}>
      <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <h3 className="text-sm font-semibold text-slate-200">Operator setup</h3>
        <p className="text-xs mt-0.5 text-slate-500">Plain-language facts from Kickoff. Do not invent a number.</p>
      </div>
      <div className="px-4 py-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="CSM" hint="Named in the intake table and “Who to ping”.">
            <TextInput value={draft.csm_name} onChange={e => patch("csm_name", e.target.value)} />
          </Field>
          <Field label="Who works new leads" hint="Reads as a sentence subject: “Jordan and your VA work new leads.”">
            <TextInput value={draft.who_works_leads} onChange={e => patch("who_works_leads", e.target.value)} placeholder="Jordan + VA / The Waiz call center / Laura (your AI assistant)" />
          </Field>
        </div>
        <Field label="Speed standard (as sold)" hint="Leave blank if not sold with a number — the kit then says “as sold on your Kickoff” instead of inventing one.">
          <TextInput value={draft.speed_standard} onChange={e => patch("speed_standard", e.target.value)} placeholder="call within 5 minutes during business hours" />
        </Field>
        <Field label="Internal notes (not in the PDF)">
          <textarea
            value={draft.notes}
            onChange={e => patch("notes", e.target.value)}
            rows={3}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={fieldStyle}
          />
        </Field>
      </div>
    </section>
  );
}

function ReviewStep({
  draft,
  errors,
  versions,
  clientId,
  hasSlack,
  busy,
  sendingId,
  onSend,
}: {
  draft: LaunchKitDraft;
  errors: string[];
  versions: LaunchKitVersionRow[];
  clientId: string;
  hasSlack: boolean;
  busy: "draft" | "generate" | "send" | null;
  sendingId: string | null;
  onSend: (submissionId: string) => void;
}) {
  const variant = resolveVariant(draft);
  const rows: [string, string][] = [
    ["Client", `${draft.contact_first_name || "—"} · ${draft.company_name || "—"}`],
    ["Product", variant ? KIT_PRODUCT_LABELS[variant.product] : "—"],
    ["Who works leads", draft.who_works_leads || "—"],
    ["Go-live", draft.go_live_date || "—"],
    ["CSM", draft.csm_name || "—"],
    ["Market", draft.market || "—"],
    ...LAUNCH_KIT_PROPERTIES.map<[string, string]>(p => [
      p.label,
      draft.property_na[p.key] ? "N/A" : draft[p.key] || "—",
    ]),
  ];

  return (
    <div className="space-y-4">
      {draft.product === "dscr" && draft.dial_owner === "client" && (
        <Banner tone="info">
          Before Send to client: drop <code>DSCR-Prospecting-Playbook.pdf</code> and{" "}
          <code>DSCR-Cash-Out-Drip.md</code> into Drive <code>Launch Kit / 05-Playbooks/</code>{" "}
          (from Wm-os <code>dscr-dna/assets/playbook-self-serve-nurture/</code>). The PDF resource
          index points there.
        </Banner>
      )}
      <section className="rounded-lg overflow-hidden" style={panelStyle}>
        <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <h3 className="text-sm font-semibold text-slate-200">Review</h3>
          <p className="text-xs mt-0.5 text-slate-500">Copy is fixed by template. Only these fields change per client.</p>
        </div>
        <div className="px-4 py-3">
          <table className="w-full text-sm">
            <tbody>
              {rows.map(([k, v]) => (
                <tr key={k} className="border-b border-white/5 last:border-0">
                  <td className="py-1.5 pr-3 text-slate-500 whitespace-nowrap align-top">{k}</td>
                  <td className="py-1.5 text-slate-200 break-all">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {errors.length > 0 && (
          <div className="px-4 pb-4">
            <p className="text-xs font-semibold text-amber-300 mb-1">Before you can generate</p>
            <ul className="text-xs text-amber-200/90 space-y-0.5 list-disc pl-4">
              {errors.map(e => <li key={e}>{e}</li>)}
            </ul>
          </div>
        )}
      </section>

      <section className="rounded-lg overflow-hidden" style={panelStyle}>
        <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <h3 className="text-sm font-semibold text-slate-200">Versions</h3>
          <p className="text-xs mt-0.5 text-slate-500">
            Every generate creates a new version. Download → upload to Drive <code>01-Launch-PDF</code> → send to the client channel on the call.
          </p>
        </div>
        <div className="px-4 py-3 space-y-2">
          {versions.length === 0 && <p className="text-sm text-slate-500">No kit generated yet.</p>}
          {versions.map(v => (
            <div key={v.submission_id} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2" style={{ background: "#0f2040" }}>
              <div className="min-w-0">
                <p className="text-sm text-slate-200">
                  v{v.version}
                  {v.variant && <span className="text-slate-500"> · {KIT_PRODUCT_LABELS[v.variant.product as KitProduct] ?? v.variant.product} · {v.variant.dialOwner === "waiz" ? "Waiz" : "Client"} works leads</span>}
                </p>
                <p className="text-xs text-slate-500">
                  {new Date(v.submitted_at).toLocaleString()}
                  {v.template_version ? ` · template ${v.template_version}` : ""}
                  {v.sent_to_client_at ? ` · sent to client ${new Date(v.sent_to_client_at).toLocaleDateString()}` : " · not sent to client"}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={`/api/clients/${clientId}/launch-kit/download?submission=${v.submission_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold px-2.5 py-1.5 rounded-md text-slate-200 border border-white/10"
                >
                  Download
                </a>
                <button
                  type="button"
                  onClick={() => onSend(v.submission_id)}
                  disabled={busy !== null || !hasSlack}
                  title={hasSlack ? "Post the PDF link to the client Slack channel" : "No client Slack channel mapped"}
                  className="text-xs font-semibold px-2.5 py-1.5 rounded-md text-white disabled:opacity-40"
                  style={{ background: "#1d4ed8" }}
                >
                  {busy === "send" && sendingId === v.submission_id ? "Sending…" : v.sent_to_client_at ? "Send again" : "Send to client"}
                </button>
              </div>
            </div>
          ))}
          {!hasSlack && versions.length > 0 && (
            <p className="text-xs text-amber-300">No Slack channel mapped for this client — set it in Admin → Automations → Client channels to enable Send.</p>
          )}
        </div>
      </section>
    </div>
  );
}

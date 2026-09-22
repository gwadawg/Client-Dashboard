"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import ReportingTypeBadge from "@/components/ReportingTypeBadge";
import VirtualCardPreview from "@/components/virtual-card/VirtualCardPreview";
import {
  draftToVirtualCard,
  emptyVirtualCardDraft,
  validateForPublish,
  type VirtualCardDraft,
} from "@/lib/virtual-card/intake";
import { listStylePacks } from "@/lib/virtual-card/packs";
import type { VirtualCardProduct } from "@/lib/virtual-card/types";

type Props = {
  clientId: string;
  fallbackName: string;
  onClose: () => void;
  onPublished?: () => void;
};

type PackThumb = {
  pack_id: string;
  display_name: string;
  mood: string;
  light_or_dark: string;
  accent: string;
  paper: string;
  sample_value_line: string;
};

type PublishedOut = {
  card_url: string;
  learn_url: string;
  sms_snippet: string;
  qr_url: string;
};

type LoadResponse = {
  client: {
    id: string;
    name: string;
    lifecycle_status: string | null;
    reporting_type: string | null;
    virtual_business_card_url: string | null;
    virtual_card_slug: string | null;
  };
  kickoff_complete: boolean;
  draft: VirtualCardDraft;
  packs: PackThumb[];
  published: PublishedOut | null;
  template_version: string;
};

type Step = "identity" | "style" | "links" | "review";
const STEPS: { id: Step; label: string }[] = [
  { id: "identity", label: "Identity" },
  { id: "style", label: "Product & style" },
  { id: "links", label: "Links" },
  { id: "review", label: "Review & publish" },
];

const fieldStyle = {
  background: "#0f2040",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#e2e8f0",
};

const panelStyle = { border: "1px solid rgba(255,255,255,0.08)", background: "#0a1628" };

export default function VirtualCardWizard({
  clientId,
  fallbackName,
  onClose,
  onPublished,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<"draft" | "publish" | null>(null);
  const [data, setData] = useState<LoadResponse | null>(null);
  const [draft, setDraft] = useState<VirtualCardDraft>(emptyVirtualCardDraft());
  const [step, setStep] = useState<Step>("identity");
  const [publishedOut, setPublishedOut] = useState<PublishedOut | null>(null);
  const [statesText, setStatesText] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/clients/${clientId}/virtual-card`);
      const json = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (!res.ok) {
        setError(json.error ?? "Failed to load Virtual Card");
        setLoading(false);
        return;
      }
      const payload = json as LoadResponse;
      setData(payload);
      setDraft(payload.draft);
      setStatesText((payload.draft.statesLicensed ?? []).join(", "));
      setPublishedOut(payload.published);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const product: VirtualCardProduct | "" = draft.product;
  const packs = useMemo(() => {
    if (product === "rm" || product === "dscr") {
      return listStylePacks(product).map(p => ({
        pack_id: p.pack_id,
        display_name: p.display_name,
        mood: p.mood,
        light_or_dark: p.light_or_dark,
        accent: p.colors.accent,
        paper: p.colors.paper,
        sample_value_line: p.sample_value_line,
      }));
    }
    return data?.packs ?? [];
  }, [product, data?.packs]);

  const errors = useMemo(() => validateForPublish(draft), [draft]);
  const previewCard = useMemo(() => {
    try {
      if (!draft.product) return null;
      return draftToVirtualCard({
        ...draft,
        valueLine: draft.valueLine || packs.find(p => p.pack_id === draft.stylePackId)?.sample_value_line || "",
      });
    } catch {
      return null;
    }
  }, [draft, packs]);

  const kickoffComplete = data?.kickoff_complete ?? true;
  const clientName = data?.client.name ?? fallbackName;
  const stepIdx = STEPS.findIndex(s => s.id === step);

  function patch<K extends keyof VirtualCardDraft>(key: K, value: VirtualCardDraft[K]) {
    setDraft(prev => ({ ...prev, [key]: value }));
    setSaveError(null);
    setNotice(null);
  }

  function syncStates(text: string) {
    setStatesText(text);
    const states = text
      .split(/[,|]/)
      .map(s => s.trim().toUpperCase())
      .filter(Boolean);
    patch("statesLicensed", states);
  }

  async function saveDraft() {
    setBusy("draft");
    setSaveError(null);
    const res = await fetch(`/api/clients/${clientId}/virtual-card`, {
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
    setNotice("Draft saved");
  }

  async function publish() {
    setBusy("publish");
    setSaveError(null);
    const res = await fetch(`/api/clients/${clientId}/virtual-card`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "publish", draft }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setSaveError(json.error ?? "Publish failed");
      return;
    }
    const out: PublishedOut = {
      card_url: json.card_url,
      learn_url: json.learn_url,
      sms_snippet: json.sms_snippet,
      qr_url: json.qr_url,
    };
    setPublishedOut(out);
    setNotice("Published");
    onPublished?.();
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Copied");
    } catch {
      setNotice("Copy failed — select the text manually");
    }
  }

  /** Portal above Client File (z-50) / Launch Kit (z-60) stacking contexts. */
  function portal(node: React.ReactNode) {
    if (!mounted || typeof document === "undefined") return null;
    return createPortal(node, document.body);
  }

  if (loading) {
    return portal(
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
        <div className="rounded-xl px-6 py-4 text-sm text-slate-300" style={panelStyle}>
          Loading card…
        </div>
      </div>,
    );
  }

  if (error) {
    return portal(
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
        <div className="max-w-md rounded-xl p-6" style={panelStyle}>
          <p className="text-sm text-rose-300">{error}</p>
          <button type="button" className="mt-4 text-sm text-slate-300 underline" onClick={onClose}>
            Close
          </button>
        </div>
      </div>,
    );
  }

  return portal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/70 p-3 sm:p-6">
      <div className="my-2 w-full max-w-3xl rounded-2xl shadow-2xl" style={panelStyle}>
        <header className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Virtual Business Card
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-100">{clientName}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {data?.client.reporting_type ? (
                <ReportingTypeBadge value={data.client.reporting_type} size="sm" />
              ) : null}
              {!kickoffComplete ? (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-200">
                  Kickoff incomplete — soft warning only
                </span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-slate-400 hover:bg-white/5 hover:text-slate-200"
          >
            Close
          </button>
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-white/10 px-3 py-2">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStep(s.id)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium ${
                step === s.id
                  ? "bg-sky-500/20 text-sky-200"
                  : i < stepIdx
                    ? "text-slate-400 hover:bg-white/5"
                    : "text-slate-500 hover:bg-white/5"
              }`}
            >
              {i + 1}. {s.label}
            </button>
          ))}
        </nav>

        <div className="space-y-4 px-5 py-5">
          {step === "identity" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Slug (loanofficer.me/…)">
                <input
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={fieldStyle}
                  value={draft.slug}
                  onChange={e => patch("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  placeholder="paul-scheper"
                />
              </Field>
              <Field label="Full name">
                <input
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={fieldStyle}
                  value={draft.fullName}
                  onChange={e => patch("fullName", e.target.value)}
                />
              </Field>
              <Field label="Title">
                <input
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={fieldStyle}
                  value={draft.title}
                  onChange={e => patch("title", e.target.value)}
                />
              </Field>
              <Field label="Company">
                <input
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={fieldStyle}
                  value={draft.company}
                  onChange={e => patch("company", e.target.value)}
                />
              </Field>
              <Field label="NMLS">
                <input
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={fieldStyle}
                  value={draft.nmls}
                  onChange={e => patch("nmls", e.target.value.replace(/\D/g, ""))}
                />
              </Field>
              <Field label="States licensed (comma-separated)">
                <input
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={fieldStyle}
                  value={statesText}
                  onChange={e => syncStates(e.target.value)}
                  placeholder="CA, AZ"
                />
              </Field>
              <Field
                label="Phone"
                hint="Internal: use our Go High Level prospecting number for this subaccount — not the LO's personal phone."
              >
                <input
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={fieldStyle}
                  value={draft.phone}
                  onChange={e => patch("phone", e.target.value)}
                  placeholder="GHL number we prospect with"
                />
              </Field>
              <Field label="Email">
                <input
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={fieldStyle}
                  value={draft.email}
                  onChange={e => patch("email", e.target.value)}
                />
              </Field>
              <Field label="Headshot URL (public https)" className="sm:col-span-2">
                <input
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={fieldStyle}
                  value={draft.headshotUrl}
                  onChange={e => patch("headshotUrl", e.target.value)}
                />
              </Field>
              <Field label="Value line (optional — pack default if blank)" className="sm:col-span-2">
                <textarea
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={fieldStyle}
                  rows={2}
                  value={draft.valueLine}
                  onChange={e => patch("valueLine", e.target.value)}
                />
              </Field>
            </div>
          )}

          {step === "style" && (
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-xs font-medium text-slate-400">Product</p>
                <div className="flex gap-2">
                  {(["rm", "dscr"] as const).map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        const nextPacks = listStylePacks(p);
                        patch("product", p);
                        if (!nextPacks.some(x => x.pack_id === draft.stylePackId)) {
                          patch("stylePackId", nextPacks[0]?.pack_id ?? "");
                        }
                      }}
                      className={`rounded-lg px-4 py-2 text-sm font-medium ${
                        draft.product === p
                          ? "bg-sky-500/25 text-sky-100"
                          : "bg-white/5 text-slate-400 hover:bg-white/10"
                      }`}
                    >
                      {p === "rm" ? "Reverse mortgage" : "DSCR"}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-medium text-slate-400">Style pack</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {packs.map(p => (
                    <button
                      key={p.pack_id}
                      type="button"
                      onClick={() => patch("stylePackId", p.pack_id)}
                      className={`rounded-xl p-3 text-left transition ${
                        draft.stylePackId === p.pack_id
                          ? "ring-2 ring-sky-400/70"
                          : "ring-1 ring-white/10 hover:ring-white/25"
                      }`}
                      style={{ background: p.paper }}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{ background: p.accent }}
                        />
                        <span className="text-sm font-semibold" style={{ color: p.accent }}>
                          {p.display_name}
                        </span>
                        <span className="ml-auto text-[10px] uppercase tracking-wide opacity-60" style={{ color: p.accent }}>
                          {p.light_or_dark}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[11px] leading-snug opacity-70" style={{ color: "#222" }}>
                        {p.mood}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === "links" && (
            <div className="space-y-4">
              <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.03)" }}>
                <p className="text-sm font-medium text-slate-200">Self-booking calendar</p>
                <p className="mt-1 text-xs text-slate-500">
                  Prefills from Launch Kit calendar when present. Turn off if this LO has no booking link.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => patch("bookingNeeded", true)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                      draft.bookingNeeded ? "bg-emerald-500/20 text-emerald-200" : "bg-white/5 text-slate-400"
                    }`}
                  >
                    Needed
                  </button>
                  <button
                    type="button"
                    onClick={() => patch("bookingNeeded", false)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                      !draft.bookingNeeded ? "bg-slate-500/25 text-slate-200" : "bg-white/5 text-slate-400"
                    }`}
                  >
                    Not needed
                  </button>
                </div>
                {draft.bookingNeeded ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Field label="Booking URL" className="sm:col-span-2">
                      <input
                        className="w-full rounded-lg px-3 py-2 text-sm"
                        style={fieldStyle}
                        value={draft.bookingUrl}
                        onChange={e => patch("bookingUrl", e.target.value)}
                        placeholder="https://calendly.com/…"
                      />
                    </Field>
                    <Field label="Button label">
                      <input
                        className="w-full rounded-lg px-3 py-2 text-sm"
                        style={fieldStyle}
                        value={draft.bookingLabel}
                        onChange={e => patch("bookingLabel", e.target.value)}
                      />
                    </Field>
                  </div>
                ) : null}
              </div>
              <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.03)" }}>
                <p className="text-sm font-medium text-slate-200">Educate page</p>
                <p className="mt-1 text-xs text-slate-500">
                  Always on at <span className="font-mono text-slate-400">/{draft.slug || "slug"}/learn</span> —
                  stock Waiz body for the selected product. Optional LO note below.
                </p>
                <Field label="Optional LO note on educate" className="mt-3">
                  <textarea
                    className="w-full rounded-lg px-3 py-2 text-sm"
                    style={fieldStyle}
                    rows={2}
                    value={draft.loNote}
                    onChange={e => patch("loNote", e.target.value)}
                    placeholder="Leave blank for stock default (RM) or none (DSCR)"
                  />
                </Field>
              </div>
            </div>
          )}

          {step === "review" && (
            <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
              <div className="space-y-3">
                <p className="text-xs text-slate-500">
                  Publish writes the live URL to the client roster as <strong className="text-slate-300">Virtual Business Card</strong>.
                </p>
                {errors.length > 0 ? (
                  <ul className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                    {errors.map(e => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-emerald-300/90">Ready to publish</p>
                )}
                {publishedOut ? (
                  <div className="space-y-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4">
                    <p className="text-sm font-medium text-emerald-100">Live</p>
                    <OutRow label="Card" value={publishedOut.card_url} onCopy={() => copyText(publishedOut.card_url)} />
                    <OutRow label="Learn" value={publishedOut.learn_url} onCopy={() => copyText(publishedOut.learn_url)} />
                    <OutRow label="SMS" value={publishedOut.sms_snippet} onCopy={() => copyText(publishedOut.sms_snippet)} />
                    <div className="flex items-start gap-3 pt-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={publishedOut.qr_url}
                        alt="QR code for card URL"
                        width={96}
                        height={96}
                        className="rounded-lg bg-white p-1"
                      />
                      <button
                        type="button"
                        className="text-xs text-sky-300 underline"
                        onClick={() => copyText(publishedOut.qr_url)}
                      >
                        Copy QR image URL
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
              <div>
                {previewCard ? <VirtualCardPreview card={previewCard} /> : (
                  <p className="text-xs text-slate-500">Complete product + identity for preview</p>
                )}
                {draft.slug ? (
                  <a
                    className="mt-3 block text-center text-xs text-sky-300 underline"
                    href={`/card/${draft.slug}/learn`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open learn page path
                  </a>
                ) : null}
              </div>
            </div>
          )}

          {(saveError || notice) && (
            <p className={`text-xs ${saveError ? "text-rose-300" : "text-emerald-300"}`}>
              {saveError ?? notice}
            </p>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-5 py-4">
          <button
            type="button"
            disabled={stepIdx === 0}
            onClick={() => setStep(STEPS[stepIdx - 1]!.id)}
            className="rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-white/5 disabled:opacity-40"
          >
            Back
          </button>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void saveDraft()}
              className="rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-200 hover:bg-white/10 disabled:opacity-50"
            >
              {busy === "draft" ? "Saving…" : "Save draft"}
            </button>
            {step !== "review" ? (
              <button
                type="button"
                onClick={() => setStep(STEPS[stepIdx + 1]!.id)}
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                disabled={busy !== null || errors.length > 0}
                onClick={() => void publish()}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {busy === "publish" ? "Publishing…" : "Publish"}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[11px] font-medium text-slate-500">{label}</span>
      {hint && (
        <span className="mb-1.5 block text-[11px] leading-snug text-amber-400/90">{hint}</span>
      )}
      {children}
    </label>
  );
}

function OutRow({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: () => void;
}) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="w-10 shrink-0 text-slate-500">{label}</span>
      <code className="min-w-0 flex-1 break-all text-slate-200">{value}</code>
      <button type="button" className="shrink-0 text-sky-300 underline" onClick={onCopy}>
        Copy
      </button>
    </div>
  );
}

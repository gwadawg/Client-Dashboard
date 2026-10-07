"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  LANDING_THEME_LABELS,
  LANDING_THEMES,
  type LandingTheme,
} from "@/lib/landing-page/products";
import type { LandingDraft, LandingPublishMeta } from "@/lib/landing-page/types";

type Props = {
  clientId: string;
  fallbackName: string;
  onClose: () => void;
  onPublished?: () => void;
};

type LoadResponse = {
  draft: LandingDraft;
  locked: boolean;
  hasApplied: boolean;
  publish: LandingPublishMeta;
  landingPageUrl: string | null;
  thankYouPageUrl: string | null;
};

const fieldStyle = {
  background: "#0f2040",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#e2e8f0",
};

const panelStyle = { border: "1px solid rgba(255,255,255,0.08)", background: "#0a1628" };

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-xs text-slate-400">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

export default function LandingPageForm({ clientId, fallbackName, onClose, onPublished }: Props) {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<LandingDraft | null>(null);
  const [locked, setLocked] = useState(false);
  const [hasApplied, setHasApplied] = useState(false);
  const [publish, setPublish] = useState<LandingPublishMeta | null>(null);
  const [landingPageUrl, setLandingPageUrl] = useState<string | null>(null);
  const [thankYouPageUrl, setThankYouPageUrl] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/clients/${clientId}/landing-page`);
        const json = (await res.json()) as LoadResponse & { error?: string };
        if (!res.ok) throw new Error(json.error || "Could not load the landing form");
        if (cancelled) return;
        setDraft(json.draft);
        setLocked(json.locked);
        setHasApplied(json.hasApplied);
        setPublish(json.publish);
        setLandingPageUrl(json.landingPageUrl);
        setThankYouPageUrl(json.thankYouPageUrl);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  function patch(partial: Partial<LandingDraft>) {
    setDraft(current => (current ? { ...current, ...partial } : current));
  }

  function toggleNotice(notice: "texas" | "illinois", on: boolean) {
    setDraft(current => {
      if (!current) return current;
      const has = current.stateNotices.includes(notice);
      const stateNotices = on
        ? has
          ? current.stateNotices
          : [...current.stateNotices, notice]
        : current.stateNotices.filter(item => item !== notice);
      return { ...current, stateNotices };
    });
  }

  async function post(action: "save" | "publish" | "check") {
    if (!draft && action !== "check") return;
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/landing-page`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, draft }),
      });
      const json = (await res.json()) as {
        error?: string;
        draft?: LandingDraft;
        locked?: boolean;
        publish?: LandingPublishMeta;
        pr_url?: string;
        result?: string;
        landingPageUrl?: string | null;
        thankYouPageUrl?: string | null;
      };
      if (!res.ok) throw new Error(json.error || "Request failed");
      if (json.draft) setDraft(json.draft);
      if (json.publish) setPublish(json.publish);
      if (json.locked) setLocked(true);
      if (json.landingPageUrl !== undefined) setLandingPageUrl(json.landingPageUrl ?? null);
      if (json.thankYouPageUrl !== undefined) setThankYouPageUrl(json.thankYouPageUrl ?? null);
      if (action === "save") setNotice("Draft saved");
      if (action === "publish") {
        setNotice("Pull request opened");
        onPublished?.();
      }
      if (action === "check") {
        if (json.result === "applied") {
          setLocked(false);
          setHasApplied(true);
          setNotice("Live page saved on the client");
          onPublished?.();
        } else {
          setNotice("The page is not live yet. Check again after the Vercel build finishes.");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  function portal(node: ReactNode) {
    if (!mounted || typeof document === "undefined") return null;
    return createPortal(node, document.body);
  }

  if (loading || error || !draft) {
    return portal(
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
        <div className="max-w-md rounded-xl p-6" style={panelStyle}>
          <p className="text-sm text-slate-300">{error || "Loading landing page…"}</p>
          <button type="button" className="mt-4 text-sm text-slate-300 underline" onClick={onClose}>
            Close
          </button>
        </div>
      </div>,
    );
  }

  const inputClass = "w-full rounded-md px-3 py-2 text-sm outline-none";
  const disabled = locked || busy;
  const showAccent = draft.theme === "theme-custom" || draft.theme === "theme-light";

  return portal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/70 p-3 sm:p-6">
      <div className="my-2 w-full max-w-3xl rounded-2xl shadow-2xl" style={panelStyle}>
        <header className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Landing page
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-100">{fallbackName}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-slate-400 hover:bg-white/5 hover:text-slate-200"
          >
            Close
          </button>
        </header>

        <div className="space-y-6 px-5 py-5">
          {locked && (
            <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-3 text-sm text-amber-100">
              <p>A publish is open. This form stays read-only until that pull request merges or closes.</p>
              {publish?.pr_url ? (
                <a className="mt-2 inline-block underline" href={publish.pr_url} target="_blank" rel="noreferrer">
                  Open pull request
                </a>
              ) : null}
              {publish?.merged ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void post("check")}
                  className="mt-3 block rounded-md bg-white/10 px-3 py-1.5 text-xs font-semibold"
                >
                  Check live page
                </button>
              ) : null}
              {publish?.error ? <p className="mt-2 text-xs text-amber-200">{publish.error}</p> : null}
            </div>
          )}

          {landingPageUrl ? (
            <p className="text-xs text-slate-400">
              Live:{" "}
              <a className="text-slate-200 underline" href={landingPageUrl} target="_blank" rel="noreferrer">
                {landingPageUrl}
              </a>
              {thankYouPageUrl ? ` · ${thankYouPageUrl}` : ""}
            </p>
          ) : null}

          {error ? <p className="text-sm text-rose-300">{error}</p> : null}
          {notice ? <p className="text-sm text-emerald-300">{notice}</p> : null}

          <section className="grid gap-4 sm:grid-cols-2">
            <Field label="Template">
              <select
                className={inputClass}
                style={fieldStyle}
                disabled={disabled}
                value={draft.theme}
                onChange={e => {
                  const theme = e.target.value as LandingTheme;
                  patch(theme === "theme-1" ? { theme, accent: "" } : { theme });
                }}
              >
                {LANDING_THEMES.map(theme => (
                  <option key={theme} value={theme}>
                    {LANDING_THEME_LABELS[theme]}
                  </option>
                ))}
              </select>
            </Field>
            {showAccent ? (
              <Field label={draft.theme === "theme-custom" ? "Color (required)" : "Color (optional)"}>
                <input
                  className={inputClass}
                  style={fieldStyle}
                  disabled={disabled}
                  value={draft.accent}
                  placeholder="#1B4D3E"
                  onChange={e => patch({ accent: e.target.value })}
                />
              </Field>
            ) : null}
            <Field label="Slug">
              <input
                className={inputClass}
                style={fieldStyle}
                disabled={disabled}
                value={draft.slug}
                onChange={e => patch({ slug: e.target.value.toLowerCase() })}
              />
            </Field>
            <Field label="Quiz URL">
              <input
                className={inputClass}
                style={fieldStyle}
                disabled={disabled}
                value={draft.applyUrl}
                placeholder="https://"
                onChange={e => patch({ applyUrl: e.target.value })}
              />
            </Field>
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <Field label="Public name">
              <input className={inputClass} style={fieldStyle} disabled={disabled} value={draft.name} onChange={e => patch({ name: e.target.value })} />
            </Field>
            <Field label="First name">
              <input className={inputClass} style={fieldStyle} disabled={disabled} value={draft.firstName} onChange={e => patch({ firstName: e.target.value })} />
            </Field>
            <Field label="Title">
              <input className={inputClass} style={fieldStyle} disabled={disabled} value={draft.title} onChange={e => patch({ title: e.target.value })} />
            </Field>
            <Field label="Company">
              <input className={inputClass} style={fieldStyle} disabled={disabled} value={draft.company} onChange={e => patch({ company: e.target.value })} />
            </Field>
            <Field label="Tagline">
              <input className={inputClass} style={fieldStyle} disabled={disabled} value={draft.tagline} onChange={e => patch({ tagline: e.target.value })} />
            </Field>
            <Field label="Phone">
              <input className={inputClass} style={fieldStyle} disabled={disabled} value={draft.phone} onChange={e => patch({ phone: e.target.value })} />
            </Field>
            <Field label="Email">
              <input className={inputClass} style={fieldStyle} disabled={disabled} value={draft.email} onChange={e => patch({ email: e.target.value })} />
            </Field>
            <Field label="Booking URL">
              <input className={inputClass} style={fieldStyle} disabled={disabled} value={draft.bookingUrl} placeholder="Optional" onChange={e => patch({ bookingUrl: e.target.value })} />
            </Field>
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <Field label="Street">
              <input className={inputClass} style={fieldStyle} disabled={disabled} value={draft.street} onChange={e => patch({ street: e.target.value })} />
            </Field>
            <Field label="City">
              <input className={inputClass} style={fieldStyle} disabled={disabled} value={draft.city} onChange={e => patch({ city: e.target.value })} />
            </Field>
            <Field label="State">
              <input className={inputClass} style={fieldStyle} disabled={disabled} value={draft.region} onChange={e => patch({ region: e.target.value })} />
            </Field>
            <Field label="ZIP">
              <input className={inputClass} style={fieldStyle} disabled={disabled} value={draft.postalCode} onChange={e => patch({ postalCode: e.target.value })} />
            </Field>
            <Field label="Individual NMLS">
              <input className={inputClass} style={fieldStyle} disabled={disabled} value={draft.nmlsIndividual} onChange={e => patch({ nmlsIndividual: e.target.value })} />
            </Field>
            <Field label="Company NMLS">
              <input className={inputClass} style={fieldStyle} disabled={disabled} value={draft.nmlsCompany} onChange={e => patch({ nmlsCompany: e.target.value })} />
            </Field>
          </section>

          <Field label="Bio">
            <textarea
              className={`${inputClass} min-h-20`}
              style={fieldStyle}
              disabled={disabled}
              value={draft.bio}
              onChange={e => patch({ bio: e.target.value })}
            />
          </Field>

          <section className="flex flex-wrap gap-4 text-sm text-slate-300">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                disabled={disabled}
                checked={draft.smsStatus === "ready"}
                onChange={e => patch({ smsStatus: e.target.checked ? "ready" : "pending" })}
              />
              Texting approved
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                disabled={disabled || !hasApplied}
                checked={draft.preview || !hasApplied}
                onChange={e => patch({ preview: e.target.checked })}
              />
              Hide from search
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                disabled={disabled}
                checked={draft.stateNotices.includes("texas")}
                onChange={e => toggleNotice("texas", e.target.checked)}
              />
              Texas notice
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                disabled={disabled}
                checked={draft.stateNotices.includes("illinois")}
                onChange={e => toggleNotice("illinois", e.target.checked)}
              />
              Illinois notice
            </label>
          </section>
          {!hasApplied ? (
            <p className="text-xs text-slate-500">The first publish stays out of search. Turn indexing on with a later publish.</p>
          ) : null}
        </div>

        <footer className="flex justify-end gap-2 border-t border-white/10 px-5 py-4">
          <button
            type="button"
            disabled={disabled}
            onClick={() => void post("save")}
            className="rounded-lg px-3 py-2 text-sm text-slate-200"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            Save draft
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => void post("publish")}
            className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-950"
            style={{ background: "#34d399" }}
          >
            Publish
          </button>
        </footer>
      </div>
    </div>
  );
}

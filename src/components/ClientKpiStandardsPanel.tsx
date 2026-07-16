"use client";

import { useMemo, useState } from "react";
import {
  DEFAULT_KPI_BANDS,
  KPI_META,
  TIER_LABEL,
  type ClientHealthSnapshot,
  type ClientKpiBenchmarks,
  type HealthTier,
  type KpiKey,
} from "@/lib/client-health";
import {
  COST_KPI_KEYS,
  KPI_DEFINITIONS,
  formatBandValue,
  hasBenchmarkOverrides,
  kpiKeysForReportingType,
  resolveKpiBands,
} from "@/lib/kpi-definitions";

type Props = {
  clientId: string;
  clientName: string;
  isCallCenter: boolean;
  snapshot: ClientHealthSnapshot;
  benchmarks: ClientKpiBenchmarks | null;
  updatedAt: string | null;
  note: string | null;
  onSaved: () => void;
};

const TIER_STYLES: Record<HealthTier, { bg: string; text: string; border: string }> = {
  critical: { bg: "rgba(239,68,68,0.18)", text: "#f87171", border: "rgba(239,68,68,0.4)" },
  below: { bg: "rgba(245,158,11,0.15)", text: "#fbbf24", border: "rgba(245,158,11,0.35)" },
  at: { bg: "rgba(52,211,153,0.12)", text: "#34d399", border: "rgba(52,211,153,0.3)" },
  above: { bg: "rgba(59,130,246,0.15)", text: "#60a5fa", border: "rgba(59,130,246,0.35)" },
  insufficient: { bg: "rgba(100,116,139,0.12)", text: "#64748b", border: "rgba(100,116,139,0.25)" },
};

const BAND_KEYS = ["critical", "below", "at"] as const;

function TierBadge({ tier }: { tier: HealthTier }) {
  const s = TIER_STYLES[tier];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide"
      style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}` }}
    >
      {TIER_LABEL[tier]}
    </span>
  );
}

function structuredCopy(src: ClientKpiBenchmarks | null | undefined): ClientKpiBenchmarks {
  if (!src) return {};
  return JSON.parse(JSON.stringify(src)) as ClientKpiBenchmarks;
}

function fieldStyle(): React.CSSProperties {
  return {
    background: "#0f2040",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#e2e8f0",
  };
}

function relativeAge(iso: string | null): string {
  if (!iso) return "never";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

/**
 * Client Success SOP + criteria panel.
 * Shows what each KPI means, this client's judgment bars, and (for cost KPIs)
 * an editor with "Use defaults". librarySlug hooks are reserved for future SOPs.
 */
export default function ClientKpiStandardsPanel({
  clientId,
  clientName,
  isCallCenter,
  snapshot,
  benchmarks,
  updatedAt,
  note,
  onSaved,
}: Props) {
  const keys = useMemo(() => kpiKeysForReportingType(isCallCenter), [isCallCenter]);
  const costKeys = useMemo(
    () => keys.filter(k => COST_KPI_KEYS.includes(k)),
    [keys],
  );
  const rateKeys = useMemo(
    () => keys.filter(k => !COST_KPI_KEYS.includes(k)),
    [keys],
  );

  const [expanded, setExpanded] = useState<KpiKey | null>(keys[0] ?? null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ClientKpiBenchmarks>(() => structuredCopy(benchmarks));
  const [draftNote, setDraftNote] = useState(note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasCustom = hasBenchmarkOverrides(benchmarks, costKeys);
  const usingDefaults = !hasCustom;

  function startEdit() {
    setDraft(structuredCopy(benchmarks));
    setDraftNote(note ?? "");
    setError(null);
    setEditing(true);
  }

  function setBand(kpi: KpiKey, band: "critical" | "below" | "at", raw: string) {
    setDraft(prev => {
      const next: ClientKpiBenchmarks = { ...prev, [kpi]: { ...(prev[kpi] ?? {}) } };
      const num = Number(raw);
      if (raw.trim() === "" || Number.isNaN(num)) {
        delete next[kpi]![band];
      } else {
        next[kpi]![band] = num;
      }
      if (next[kpi] && Object.keys(next[kpi]!).length === 0) delete next[kpi];
      return next;
    });
  }

  async function save(benchmarksPayload: ClientKpiBenchmarks | null, notePayload: string | null) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kpi_benchmarks: benchmarksPayload,
          kpi_benchmarks_note: notePayload,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Failed to save benchmarks");
        setBusy(false);
        return;
      }
      setEditing(false);
      setBusy(false);
      onSaved();
    } catch {
      setError("Failed to save benchmarks");
      setBusy(false);
    }
  }

  function overrideCount(src: ClientKpiBenchmarks): number {
    return Object.values(src).reduce((n, b) => n + Object.keys(b ?? {}).length, 0);
  }

  function renderKpiRow(key: KpiKey, editable: boolean) {
    const def = KPI_DEFINITIONS[key];
    const grade = snapshot.grades.find(g => g.key === key);
    const resolved = resolveKpiBands(key, editing ? draft : benchmarks);
    const globals = DEFAULT_KPI_BANDS[key];
    const isOpen = expanded === key;
    const overridden = hasBenchmarkOverrides(benchmarks, [key]);

    return (
      <div
        key={key}
        className="rounded-lg overflow-hidden"
        style={{ background: "#050c18", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        <button
          type="button"
          onClick={() => setExpanded(isOpen ? null : key)}
          className="w-full text-left px-4 py-3 flex flex-wrap items-center gap-3"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold" style={{ color: "#e2e8f0" }}>
                {KPI_META[key].label}
              </span>
              <span
                className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                style={{ color: "#64748b", background: "rgba(100,116,139,0.15)" }}
              >
                {def.ownerLabel}
              </span>
              {overridden && (
                <span className="text-[10px] font-semibold" style={{ color: "#38bdf8" }}>
                  Custom bar
                </span>
              )}
              {!overridden && editable && (
                <span className="text-[10px]" style={{ color: "#475569" }}>
                  Global default
                </span>
              )}
            </div>
            <p className="text-xs mt-0.5 truncate" style={{ color: "#64748b" }}>
              {def.meaning}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {grade && (
              <div className="text-right">
                <p className="text-sm font-semibold tabular-nums" style={{ color: "#e2e8f0" }}>
                  {grade.display}
                </p>
                <TierBadge tier={grade.tier} />
              </div>
            )}
            <span className="text-xs" style={{ color: "#334155" }}>
              {isOpen ? "▲" : "▼"}
            </span>
          </div>
        </button>

        {isOpen && (
          <div className="px-4 pb-4 space-y-3" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
            <div className="grid sm:grid-cols-2 gap-3 pt-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#475569" }}>
                  Formula
                </p>
                <p className="text-xs" style={{ color: "#94a3b8" }}>
                  {def.formula}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#475569" }}>
                  Judgment bars (this client)
                </p>
                <p className="text-xs tabular-nums" style={{ color: "#94a3b8" }}>
                  911 {globals.higherIsBetter ? "<" : ">"} {formatBandValue(key, resolved.critical)}
                  {" · "}
                  Below {globals.higherIsBetter ? "<" : ">"} {formatBandValue(key, resolved.below)}
                  {" · "}
                  At {globals.higherIsBetter ? "<" : ">"} {formatBandValue(key, resolved.at)}
                  {" · "}
                  else Above
                </p>
              </div>
            </div>

            {def.fixHints.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "#475569" }}>
                  When this KPI is red
                </p>
                <ul className="space-y-1">
                  {def.fixHints.map((hint, i) => (
                    <li key={i} className="text-xs flex gap-1.5" style={{ color: "#94a3b8" }}>
                      <span style={{ color: "#475569" }}>→</span> {hint}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Future Library SOP hook */}
            <div
              className="rounded-md px-3 py-2 text-xs"
              style={{ background: "rgba(56,189,248,0.06)", border: "1px solid rgba(56,189,248,0.15)", color: "#64748b" }}
            >
              {def.librarySlug ? (
                <a href={`/?view=library&slug=${def.librarySlug}`} className="font-semibold" style={{ color: "#38bdf8" }}>
                  Open playbook in Library →
                </a>
              ) : (
                <>Library SOP link — coming soon for {KPI_META[key].short}. Slot reserved for a Library doc.</>
              )}
            </div>

            {editable && editing && (
              <div className="flex flex-wrap gap-3 items-end pt-1">
                {BAND_KEYS.map(band => (
                  <label key={band} className="text-[10px] uppercase tracking-wider" style={{ color: "#475569" }}>
                    {band === "critical" ? "911" : band === "below" ? "Below" : "At"}
                    <input
                      type="number"
                      value={draft[key]?.[band] ?? ""}
                      placeholder={String(globals.bands[band] ?? "")}
                      disabled={busy}
                      onChange={e => setBand(key, band, e.target.value)}
                      className="mt-1 block px-2 py-1.5 rounded-lg text-xs outline-none w-24 tabular-nums"
                      style={fieldStyle()}
                    />
                  </label>
                ))}
                <p className="text-[10px]" style={{ color: "#475569" }}>
                  Blank = global default ({globals.unit === "money" ? "$" : "%"})
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div className="px-5 py-4 flex flex-wrap items-start justify-between gap-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div>
          <h3 className="text-base font-semibold" style={{ color: "#e2e8f0" }}>
            KPI standards & playbook
          </h3>
          <p className="text-xs mt-1 max-w-2xl" style={{ color: "#64748b" }}>
            What each KPI means for <span style={{ color: "#94a3b8" }}>{clientName}</span>, the bars we judge them against,
            and what to do when a metric is red. Conversion rates use the global team standard;
            cost bars (CPL / CPQL / CPConv) can be customized per client.
          </p>
          <p className="text-xs mt-1.5" style={{ color: usingDefaults ? "#34d399" : "#38bdf8" }}>
            {usingDefaults
              ? "Using global default cost standards"
              : `Custom cost standards · last set ${relativeAge(updatedAt)}${note ? ` · “${note}”` : ""}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!editing ? (
            <>
              {!isCallCenter && (
                <button
                  type="button"
                  onClick={startEdit}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                  style={{ color: "#38bdf8", background: "rgba(56,189,248,0.12)", border: "1px solid rgba(56,189,248,0.25)" }}
                >
                  Edit cost standards
                </button>
              )}
              {hasCustom && (
                <button
                  type="button"
                  onClick={() => save(null, null)}
                  disabled={busy}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                  style={{ color: "#94a3b8", background: "#0f2040", border: "1px solid rgba(255,255,255,0.12)", opacity: busy ? 0.5 : 1 }}
                >
                  Use defaults
                </button>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setDraft({});
                  setDraftNote("");
                }}
                disabled={busy}
                className="text-xs px-3 py-1.5 rounded-lg"
                style={{ color: "#94a3b8", background: "#0f2040", border: "1px solid rgba(255,255,255,0.12)" }}
              >
                Clear to defaults
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={busy}
                className="text-xs px-3 py-1.5 rounded-lg"
                style={{ color: "#94a3b8" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const count = overrideCount(draft);
                  void save(count > 0 ? draft : null, count > 0 ? draftNote.trim() || null : null);
                }}
                disabled={busy}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                style={{ color: "#22c55e", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", opacity: busy ? 0.5 : 1 }}
              >
                {busy ? "Saving…" : "Save standards"}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="p-5 space-y-5">
        {error && (
          <p className="text-xs" style={{ color: "#f87171" }}>
            {error}
          </p>
        )}

        {editing && (
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#475569" }}>
              Reason for these cost standards (recorded with save)
            </label>
            <input
              value={draftNote}
              onChange={e => setDraftNote(e.target.value)}
              disabled={busy}
              placeholder="e.g. High-cost CA market — CPQL/CPConv bars raised vs global"
              className="mt-1 block w-full max-w-2xl px-3 py-2 rounded-lg text-xs outline-none"
              style={fieldStyle()}
            />
          </div>
        )}

        {!isCallCenter && costKeys.length > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "#38bdf8" }}>
              Acquisition costs — per-client bars allowed
            </p>
            <div className="space-y-2">{costKeys.map(k => renderKpiRow(k, true))}</div>
          </div>
        )}

        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "#475569" }}>
            Conversion rates — global team standard
          </p>
          <div className="space-y-2">{rateKeys.map(k => renderKpiRow(k, false))}</div>
        </div>
      </div>
    </div>
  );
}

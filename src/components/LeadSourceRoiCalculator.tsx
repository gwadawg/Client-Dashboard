"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FIELD_TOOLTIPS,
  PUBLIC_DISCLAIMER,
  TOOL_SUBTITLE,
  TOOL_TITLE,
  rangeCaption,
} from "@/lib/lead-source-roi/config";
import { simulateCompare } from "@/lib/lead-source-roi/math";
import {
  createDefaultState,
  decodeCompareState,
  encodeCompareState,
  patchSide,
  setIncludeFees,
  setLinkCommission,
  setLinkSpend,
  type SidePatch,
} from "@/lib/lead-source-roi/state";
import type { CompareState, SideInputs, SideKey, SideOutcomes } from "@/lib/lead-source-roi/types";

type Props = {
  variant: "internal" | "public";
  initialEncoded?: string | null;
  onStateChange?: (encoded: string) => void;
};

const PANEL = "#0a1628";
const INPUT_BG = "#0f2040";
const MUTED = "#64748b";
const LABEL = "#94a3b8";
const TEXT = "#e2e8f0";
const AMBER = "#f59e0b";
const GOOD = "#22c55e";
const BAD = "#ef4444";
const BORDER = "1px solid rgba(255,255,255,0.08)";

function formatMoney(n: number | null | undefined, digits = 0): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function formatPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function formatMult(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(2)}×`;
}

function formatNum(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 100) return Math.round(n).toLocaleString();
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function FieldTooltip({ fieldKey }: { fieldKey: keyof typeof FIELD_TOOLTIPS }) {
  const tip = FIELD_TOOLTIPS[fieldKey];
  const [open, setOpen] = useState(false);
  if (!tip) return null;
  return (
    <span className="relative inline-flex ml-1 align-middle">
      <button
        type="button"
        aria-label={`About ${fieldKey}`}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        className="w-4 h-4 rounded-full text-[10px] font-semibold leading-none flex items-center justify-center"
        style={{
          color: MUTED,
          border: "1px solid rgba(255,255,255,0.18)",
          background: "transparent",
        }}
      >
        ?
      </button>
      {open && (
        <span
          className="absolute z-20 left-5 top-0 w-56 p-2.5 rounded-lg text-[11px] leading-snug shadow-lg"
          style={{
            background: "#132038",
            border: "1px solid rgba(255,255,255,0.12)",
            color: TEXT,
          }}
        >
          <span className="block font-medium" style={{ color: "#cbd5e1" }}>
            {tip.definition}
          </span>
          <span className="block mt-1" style={{ color: MUTED }}>
            {tip.why}
          </span>
        </span>
      )}
    </span>
  );
}

function NumField({
  label,
  fieldKey,
  value,
  onChange,
  prefix,
  suffix,
  disabled,
  caption,
  step = 1,
}: {
  label: string;
  fieldKey: keyof typeof FIELD_TOOLTIPS;
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
  disabled?: boolean;
  caption?: string;
  step?: number;
}) {
  return (
    <div>
      <label className="flex items-center text-xs font-medium mb-1.5" style={{ color: LABEL }}>
        {label}
        <FieldTooltip fieldKey={fieldKey} />
      </label>
      <div className="relative">
        {prefix && (
          <span
            className="absolute left-3 top-1/2 -translate-y-1/2 text-sm"
            style={{ color: MUTED }}
          >
            {prefix}
          </span>
        )}
        {suffix && (
          <span
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs"
            style={{ color: MUTED }}
          >
            {suffix}
          </span>
        )}
        <input
          type="number"
          min={0}
          step={step}
          disabled={disabled}
          value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className={`w-full py-2 rounded-lg text-sm font-medium outline-none tabular-nums ${
            prefix ? "pl-7 pr-3" : suffix ? "pl-3 pr-8" : "px-3"
          } disabled:opacity-50`}
          style={{
            background: INPUT_BG,
            border: "1px solid rgba(255,255,255,0.12)",
            color: TEXT,
          }}
        />
      </div>
      {caption && (
        <p className="text-[10px] mt-1" style={{ color: MUTED }}>
          {caption}
        </p>
      )}
    </div>
  );
}

function SideColumn({
  title,
  subtitle,
  sideKey,
  inputs,
  isWaiz,
  linkSpend,
  linkCommission,
  includeFees,
  costPerConversation,
  contacts,
  onPatch,
}: {
  title: string;
  subtitle: string;
  sideKey: SideKey;
  inputs: SideInputs;
  isWaiz: boolean;
  linkSpend: boolean;
  linkCommission: boolean;
  includeFees: boolean;
  /** Derived: ad spend ÷ contacts (not loaded fees). */
  costPerConversation: number | null;
  contacts: number;
  onPatch: (key: SideKey, patch: SidePatch) => void;
}) {
  const spendLocked = isWaiz && linkSpend;
  const commissionLocked = isWaiz && linkCommission;

  return (
    <div className="rounded-xl p-4 space-y-3" style={{ background: PANEL, border: BORDER }}>
      <div>
        <h3 className="text-sm font-semibold tracking-wide uppercase" style={{ color: isWaiz ? AMBER : LABEL }}>
          {title}
        </h3>
        <p className="text-[11px] mt-0.5" style={{ color: MUTED }}>
          {subtitle}
        </p>
      </div>

      <NumField
        label="Ad spend"
        fieldKey="ad_spend"
        value={inputs.ad_spend}
        prefix="$"
        disabled={spendLocked}
        caption={spendLocked ? "Linked to Current" : undefined}
        onChange={(v) => onPatch(sideKey, { ad_spend: v })}
      />
      <div className="grid grid-cols-2 gap-3">
        <NumField
          label="CPL"
          fieldKey="cpl"
          value={inputs.cpl}
          prefix="$"
          step={0.5}
          caption={isWaiz ? rangeCaption("cpl") : undefined}
          onChange={(v) => onPatch(sideKey, { cpl: v })}
        />
        <NumField
          label="Leads"
          fieldKey="leads"
          value={inputs.leads}
          step={1}
          onChange={(v) => onPatch(sideKey, { leads: v })}
        />
      </div>
      <NumField
        label="Contact rate"
        fieldKey="contact_rate_pct"
        value={inputs.contact_rate_pct}
        suffix="%"
        step={0.5}
        caption={isWaiz ? rangeCaption("contact_rate_pct") : "Of leads that became a conversation"}
        onChange={(v) => onPatch(sideKey, { contact_rate_pct: v })}
      />

      {/* Derived — not editable; live from spend ÷ contacts */}
      <div
        className="rounded-lg px-3 py-2.5"
        style={{
          background: isWaiz ? "rgba(245,158,11,0.1)" : "rgba(148,163,184,0.08)",
          border: isWaiz
            ? "1px solid rgba(245,158,11,0.28)"
            : "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center text-xs font-medium" style={{ color: LABEL }}>
            Cost per conversation
            <FieldTooltip fieldKey="cost_per_conversation" />
          </span>
          <span
            className="text-[10px] uppercase tracking-wide shrink-0"
            style={{ color: MUTED }}
          >
            Auto
          </span>
        </div>
        <p
          className="text-2xl font-semibold tabular-nums mt-1"
          style={{ color: isWaiz ? AMBER : TEXT }}
        >
          {formatMoney(costPerConversation)}
        </p>
        <p className="text-[10px] mt-1 leading-snug" style={{ color: MUTED }}>
          Ad spend ÷ contacts
          {contacts > 0
            ? ` · ${formatNum(contacts)} conversations`
            : " · need contact rate & leads for this"}
          . Not editable.
        </p>
      </div>

      <NumField
        label="Close rate"
        fieldKey="close_rate_pct"
        value={inputs.close_rate_pct}
        suffix="%"
        step={0.5}
        caption={isWaiz ? rangeCaption("close_rate_pct") : "Of conversations that fund/close"}
        onChange={(v) => onPatch(sideKey, { close_rate_pct: v })}
      />
      <NumField
        label="Avg commission"
        fieldKey="avg_commission"
        value={inputs.avg_commission}
        prefix="$"
        disabled={commissionLocked}
        caption={
          commissionLocked
            ? "Linked to Current"
            : isWaiz
              ? "Edit freely — e.g. higher DSCR pay vs their current product"
              : "What they make per close on their current product mix"
        }
        onChange={(v) => onPatch(sideKey, { avg_commission: v })}
      />
      {includeFees && (
        <NumField
          label={isWaiz ? "Program fee" : "Vendor fee (optional)"}
          fieldKey="program_fee"
          value={inputs.program_fee}
          prefix="$"
          onChange={(v) => onPatch(sideKey, { program_fee: v })}
        />
      )}
    </div>
  );
}

function OutcomeRow({
  label,
  current,
  waiz,
  delta,
  range,
  emphasize,
}: {
  label: string;
  current: string;
  waiz: string;
  delta: string;
  range?: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className="grid grid-cols-4 gap-2 items-start py-2.5 px-2 rounded-lg"
      style={{
        background: emphasize ? "rgba(245,158,11,0.08)" : "transparent",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
      }}
    >
      <div>
        <p className="text-xs" style={{ color: LABEL }}>
          {label}
        </p>
        {range && (
          <p className="text-[10px] mt-0.5" style={{ color: MUTED }}>
            {range}
          </p>
        )}
      </div>
      <p className="text-sm tabular-nums text-right" style={{ color: TEXT }}>
        {current}
      </p>
      <p className="text-sm tabular-nums text-right font-medium" style={{ color: TEXT }}>
        {waiz}
      </p>
      <p
        className="text-sm tabular-nums text-right font-semibold"
        style={{ color: emphasize ? AMBER : LABEL }}
      >
        {delta}
      </p>
    </div>
  );
}

function deltaMoney(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${formatMoney(n)}`;
}

function deltaNum(n: number, digits = 1): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${formatNum(n, digits)}`;
}

function formatOutcomes(
  o: SideOutcomes,
): {
  contacts: string;
  deals: string;
  cpc: string;
  net: string;
  mult: string;
  pct: string;
} {
  return {
    contacts: formatNum(o.contacts),
    deals: formatNum(o.deals),
    // Always media cost to talk — spend ÷ contacts (not program fee).
    cpc: formatMoney(o.cost_per_conversation),
    net: formatMoney(o.net_commission),
    mult: formatMult(o.roi_multiple),
    pct: formatPct(o.roi_pct),
  };
}

export default function LeadSourceRoiCalculator({
  variant,
  initialEncoded,
  onStateChange,
}: Props) {
  const [loadError, setLoadError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [state, setState] = useState<CompareState>(() => {
    if (initialEncoded) {
      const decoded = decodeCompareState(initialEncoded);
      if (decoded) return decoded;
    }
    return createDefaultState();
  });

  useEffect(() => {
    if (initialEncoded && !decodeCompareState(initialEncoded)) {
      setLoadError(true);
    }
  }, [initialEncoded]);

  useEffect(() => {
    onStateChange?.(encodeCompareState(state));
  }, [state, onStateChange]);

  const result = useMemo(() => simulateCompare(state), [state]);
  const currentF = formatOutcomes(result.current);
  const waizF = formatOutcomes(result.waiz);

  const cpcCurrent = result.current.cost_per_conversation;
  const cpcWaiz = result.waiz.cost_per_conversation;
  const cpcSavings =
    cpcCurrent != null && cpcWaiz != null ? cpcCurrent - cpcWaiz : null;

  function onPatch(key: SideKey, patch: SidePatch) {
    setState((s) => patchSide(s, key, patch));
  }

  async function copyPublicLink() {
    const url = `${window.location.origin}/tools/lead-source-roi?s=${encodeURIComponent(encodeCompareState(state))}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  const deltaNet = result.delta.net_commission;
  const heroColor = deltaNet >= 0 ? GOOD : BAD;

  return (
    <div
      className="flex-1 min-h-0 overflow-auto p-4 md:p-6 space-y-5"
      style={{ color: TEXT }}
    >
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold" style={{ color: TEXT }}>
            {TOOL_TITLE}
          </h2>
          <p className="text-sm mt-1 max-w-xl" style={{ color: MUTED }}>
            {TOOL_SUBTITLE}
          </p>
          {loadError && (
            <p className="text-xs mt-2" style={{ color: AMBER }}>
              Couldn&apos;t load shared state — showing demo.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setLoadError(false);
              setState(createDefaultState());
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{
              background: PANEL,
              border: BORDER,
              color: LABEL,
            }}
          >
            Reset
          </button>
          <button
            type="button"
            onClick={copyPublicLink}
            className="px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{
              background: "rgba(245,158,11,0.15)",
              border: "1px solid rgba(245,158,11,0.35)",
              color: AMBER,
            }}
          >
            {copied ? "Copied" : "Copy public link"}
          </button>
        </div>
      </div>

      {/* Controls */}
      <div
        className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-6 rounded-xl px-4 py-3"
        style={{ background: PANEL, border: BORDER }}
      >
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span style={{ color: MUTED }}>Cost model</span>
          <label className="flex items-center gap-1.5 cursor-pointer" style={{ color: TEXT }}>
            <input
              type="radio"
              name="fee-mode"
              checked={!state.include_fees}
              onChange={() => setState((s) => setIncludeFees(s, false))}
            />
            Ad spend only
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer" style={{ color: TEXT }}>
            <input
              type="radio"
              name="fee-mode"
              checked={state.include_fees}
              onChange={() => setState((s) => setIncludeFees(s, true))}
            />
            Include program fee
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span style={{ color: MUTED }}>Links</span>
          <label className="flex items-center gap-1.5 cursor-pointer" style={{ color: TEXT }}>
            <input
              type="checkbox"
              checked={state.link_spend}
              onChange={(e) => setState((s) => setLinkSpend(s, e.target.checked))}
            />
            Spend linked
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer" style={{ color: TEXT }}>
            <input
              type="checkbox"
              checked={state.link_commission}
              onChange={(e) => setState((s) => setLinkCommission(s, e.target.checked))}
            />
            Commission linked
            <span style={{ color: MUTED }}>(off = set each product separately)</span>
          </label>
        </div>
      </div>

      {/* Hero: net $ + cost to talk */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div
          className="rounded-xl px-5 py-4"
          style={{
            background: "linear-gradient(135deg, rgba(34,197,94,0.08), rgba(10,22,40,0.9))",
            border: `1px solid ${deltaNet >= 0 ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`,
          }}
        >
          <p className="text-xs uppercase tracking-wide" style={{ color: MUTED }}>
            Delta net commission (With Waiz − Current)
          </p>
          <p className="text-3xl md:text-4xl font-semibold tabular-nums mt-1" style={{ color: heroColor }}>
            {deltaMoney(deltaNet)}
          </p>
          <p className="text-xs mt-2" style={{ color: LABEL }}>
            Deals Δ{" "}
            <span className="tabular-nums font-medium" style={{ color: TEXT }}>
              {deltaNum(result.delta.deals)}
            </span>
            {" · "}
            ROI Δ{" "}
            <span className="tabular-nums font-medium" style={{ color: TEXT }}>
              {result.delta.roi_multiple != null
                ? `${result.delta.roi_multiple >= 0 ? "+" : ""}${result.delta.roi_multiple.toFixed(2)}×`
                : "—"}
            </span>
          </p>
        </div>

        <div
          className="rounded-xl px-5 py-4"
          style={{
            background: "linear-gradient(135deg, rgba(59,130,246,0.1), rgba(10,22,40,0.9))",
            border: "1px solid rgba(59,130,246,0.28)",
          }}
        >
          <div className="flex items-center gap-1">
            <p className="text-xs uppercase tracking-wide" style={{ color: MUTED }}>
              Cost to talk (per conversation)
            </p>
            <FieldTooltip fieldKey="cost_per_conversation" />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] uppercase" style={{ color: MUTED }}>
                Current
              </p>
              <p className="text-2xl font-semibold tabular-nums" style={{ color: TEXT }}>
                {formatMoney(cpcCurrent)}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase" style={{ color: MUTED }}>
                With Waiz
              </p>
              <p className="text-2xl font-semibold tabular-nums" style={{ color: AMBER }}>
                {formatMoney(cpcWaiz)}
              </p>
            </div>
          </div>
          <p className="text-xs mt-2" style={{ color: LABEL }}>
            {cpcSavings == null
              ? "Ad spend ÷ contacts — updates when spend or contact rate changes."
              : cpcSavings > 0
                ? `They save ${formatMoney(cpcSavings)} per conversation vs their source.`
                : cpcSavings < 0
                  ? `Waiz is ${formatMoney(Math.abs(cpcSavings))} higher per conversation on these inputs.`
                  : "Same cost per conversation on these inputs."}
          </p>
        </div>
      </div>

      {/* Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SideColumn
          title="Current stack"
          subtitle="Your lead source today"
          sideKey="current"
          inputs={state.current}
          isWaiz={false}
          linkSpend={state.link_spend}
          linkCommission={state.link_commission}
          includeFees={state.include_fees}
          costPerConversation={result.current.cost_per_conversation}
          contacts={result.current.contacts}
          onPatch={onPatch}
        />
        <SideColumn
          title="With Waiz"
          subtitle="Same budget, our lead engine"
          sideKey="waiz"
          inputs={state.waiz}
          isWaiz
          linkSpend={state.link_spend}
          linkCommission={state.link_commission}
          includeFees={state.include_fees}
          costPerConversation={result.waiz.cost_per_conversation}
          contacts={result.waiz.contacts}
          onPatch={onPatch}
        />
      </div>

      {/* Outcomes */}
      <div className="rounded-xl p-4" style={{ background: PANEL, border: BORDER }}>
        <div className="grid grid-cols-4 gap-2 px-2 pb-2 mb-1">
          <p className="text-[10px] uppercase tracking-wide" style={{ color: MUTED }}>
            Outcome
          </p>
          <p className="text-[10px] uppercase tracking-wide text-right" style={{ color: MUTED }}>
            Current
          </p>
          <p className="text-[10px] uppercase tracking-wide text-right" style={{ color: MUTED }}>
            With Waiz
          </p>
          <p className="text-[10px] uppercase tracking-wide text-right" style={{ color: MUTED }}>
            Delta
          </p>
        </div>

        <OutcomeRow
          label="Contacts"
          current={currentF.contacts}
          waiz={waizF.contacts}
          delta={deltaNum(result.delta.contacts)}
        />
        <OutcomeRow
          label="Cost per conversation"
          current={currentF.cpc}
          waiz={waizF.cpc}
          delta={
            cpcSavings != null
              ? cpcSavings > 0
                ? `−${formatMoney(cpcSavings)} saved`
                : cpcSavings < 0
                  ? `+${formatMoney(Math.abs(cpcSavings))}`
                  : "$0"
              : "—"
          }
          range="Auto · ad spend ÷ contacts (not editable)"
          emphasize
        />
        <OutcomeRow
          label="Deals"
          current={currentF.deals}
          waiz={waizF.deals}
          delta={deltaNum(result.delta.deals)}
          range={`Range: ${formatNum(result.waiz_worst.deals)} – ${formatNum(result.waiz_best.deals)}`}
        />
        <OutcomeRow
          label="Net commission"
          current={currentF.net}
          waiz={waizF.net}
          delta={deltaMoney(result.delta.net_commission)}
          range={`Range: ${formatMoney(result.waiz_worst.net_commission)} – ${formatMoney(result.waiz_best.net_commission)}`}
          emphasize
        />
        <OutcomeRow
          label="ROI multiple"
          current={currentF.mult}
          waiz={waizF.mult}
          delta={
            result.delta.roi_multiple != null
              ? `${result.delta.roi_multiple >= 0 ? "+" : ""}${result.delta.roi_multiple.toFixed(2)}×`
              : "—"
          }
        />
        <OutcomeRow
          label="ROI %"
          current={currentF.pct}
          waiz={waizF.pct}
          delta={
            result.delta.roi_pct != null
              ? `${result.delta.roi_pct >= 0 ? "+" : ""}${(result.delta.roi_pct * 100).toFixed(1)}%`
              : "—"
          }
        />
      </div>

      <p className="text-xs leading-relaxed" style={{ color: MUTED }}>
        {PUBLIC_DISCLAIMER}
        {variant === "public" ? " Full sandbox — edit any field on either side." : ""}
      </p>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
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
  setLinkSpend,
  type SidePatch,
} from "@/lib/lead-source-roi/state";
import type { CompareState, SideInputs, SideKey } from "@/lib/lead-source-roi/types";
import { BORDER, R, T, sidePanel } from "@/lib/lead-source-roi/theme";
import { useCountUp } from "@/lib/lead-source-roi/use-count-up";
import ContactRateHelperModal from "@/components/ContactRateHelperModal";

// Charts are heavy — keep them out of the first paint of the public link.
const ScaleScenariosSection = dynamic(
  () => import("@/components/ScaleScenariosSection"),
  {
    ssr: false,
    loading: () => (
      <div
        className="h-64 animate-pulse"
        style={{ background: T.panel, border: BORDER, borderRadius: R }}
      />
    ),
  },
);

type Props = {
  variant: "internal" | "public";
  initialEncoded?: string | null;
  onStateChange?: (encoded: string) => void;
};

/* ── formatters ─────────────────────────────────────────────────────── */

function money(n: number | null | undefined, digits = 0): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function mult(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(2)}×`;
}

function num(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 100) return Math.round(n).toLocaleString();
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function signed(n: number, format: (v: number) => string): string {
  return `${n > 0 ? "+" : ""}${format(n)}`;
}

/* ── primitives ─────────────────────────────────────────────────────── */

function Eyebrow({
  children,
  color = T.low,
}: {
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <span
      className="text-[10px] font-semibold uppercase"
      style={{ color, letterSpacing: "0.13em" }}
    >
      {children}
    </span>
  );
}

/**
 * Amber wash over the parent whenever `trigger` changes. Rendered as its own
 * remounting overlay so replaying the animation never remounts — and so never
 * resets the tween of — the numbers underneath.
 */
function Flash({ trigger }: { trigger: unknown }) {
  const [runs, setRuns] = useState(0);
  const [prev, setPrev] = useState(trigger);

  if (!Object.is(prev, trigger)) {
    setPrev(trigger);
    setRuns((n) => n + 1);
  }

  if (runs === 0) return null;
  return (
    <span
      key={runs}
      aria-hidden
      className="lsr-flash pointer-events-none absolute inset-0"
      style={{ borderRadius: R }}
    />
  );
}

/** Animated numeric readout. Tweens so the eye can follow a live edit. */
function Val({
  value,
  format,
  className,
  color,
}: {
  value: number | null;
  format: (v: number | null) => string;
  className?: string;
  color?: string;
}) {
  const animated = useCountUp(value);
  return (
    <span className={`lsr-data ${className ?? ""}`} style={{ color }}>
      {format(animated)}
    </span>
  );
}

function Tip({
  fieldKey,
  label,
}: {
  fieldKey: keyof typeof FIELD_TOOLTIPS;
  label: string;
}) {
  const tip = FIELD_TOOLTIPS[fieldKey];
  const [open, setOpen] = useState(false);
  if (!tip) return null;
  return (
    <span className="relative inline-flex ml-1.5 align-middle">
      <button
        type="button"
        aria-label={`What is ${label}?`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        className="w-[15px] h-[15px] text-[9px] font-bold leading-none flex items-center justify-center transition-colors"
        style={{
          color: open ? T.amber : T.low,
          border: `1px solid ${open ? T.amberLine : T.rule}`,
          borderRadius: 3,
        }}
      >
        ?
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute z-30 left-5 -top-1 w-60 p-3 text-[11px] leading-relaxed shadow-2xl"
          style={{
            background: T.raised,
            border: `1px solid ${T.ruleStrong}`,
            borderRadius: R,
            color: T.hi,
          }}
        >
          <span className="block">{tip.definition}</span>
          <span className="block mt-1.5" style={{ color: T.mid }}>
            {tip.why}
          </span>
        </span>
      )}
    </span>
  );
}

function Field({
  label,
  fieldKey,
  value,
  onChange,
  prefix,
  suffix,
  disabled,
  caption,
  step = 1,
  lit,
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
  lit?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  return (
    <div>
      <div className="flex items-center mb-1.5">
        <span
          className="text-[10px] font-semibold uppercase"
          style={{ color: T.mid, letterSpacing: "0.1em" }}
        >
          {label}
        </span>
        <Tip fieldKey={fieldKey} label={label} />
      </div>
      <div
        className="relative flex items-center transition-colors"
        style={{
          background: T.input,
          border: `1px solid ${focused ? (lit ? T.amberLine : T.ruleStrong) : T.rule}`,
          borderRadius: R,
          opacity: disabled ? 0.45 : 1,
        }}
      >
        {prefix && (
          <span className="lsr-data pl-2.5 text-sm select-none" style={{ color: T.low }}>
            {prefix}
          </span>
        )}
        <input
          ref={ref}
          type="number"
          inputMode="decimal"
          min={0}
          step={step}
          disabled={disabled}
          aria-label={label}
          value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          // A stray trackpad scroll must never change a number mid-demo.
          onWheel={() => ref.current?.blur()}
          className="lsr-data w-full bg-transparent py-2 px-2.5 text-[15px] font-medium outline-none disabled:cursor-not-allowed"
          style={{ color: disabled ? T.mid : T.hi }}
        />
        {suffix && (
          <span className="lsr-data pr-2.5 text-xs select-none" style={{ color: T.low }}>
            {suffix}
          </span>
        )}
      </div>
      {caption && (
        <p className="text-[10px] mt-1.5 leading-snug" style={{ color: T.low }}>
          {caption}
        </p>
      )}
    </div>
  );
}

function Segmented<V extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: V;
  options: { value: V; label: string }[];
  onChange: (v: V) => void;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Eyebrow>{label}</Eyebrow>
      <div
        className="flex"
        style={{ border: BORDER, borderRadius: R, background: T.base }}
        role="radiogroup"
        aria-label={label}
      >
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o.value)}
              className="px-2.5 py-1 text-[11px] font-medium transition-colors"
              style={{
                background: on ? T.amberSoft : "transparent",
                color: on ? T.amber : T.mid,
                borderRadius: R - 1,
                boxShadow: on ? `inset 0 0 0 1px ${T.amberLine}` : undefined,
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

function Switch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 group"
    >
      <span
        className="relative block w-7 h-4 transition-colors"
        style={{
          background: checked ? T.amberSoft : T.base,
          border: `1px solid ${checked ? T.amberLine : T.rule}`,
          borderRadius: 2,
        }}
      >
        <span
          className="absolute top-[2px] block w-[10px] h-[10px] transition-all"
          style={{
            left: checked ? 13 : 2,
            background: checked ? T.amber : T.low,
            borderRadius: 1,
          }}
        />
      </span>
      <span className="text-[11px] font-medium" style={{ color: checked ? T.hi : T.mid }}>
        {label}
      </span>
    </button>
  );
}

/* ── verdict band ───────────────────────────────────────────────────── */

function VerdictCell({
  eyebrow,
  children,
  footer,
  accent,
}: {
  eyebrow: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  accent?: string;
}) {
  return (
    <div className="px-5 py-4 flex flex-col justify-between min-w-0">
      <Eyebrow color={accent ?? T.low}>{eyebrow}</Eyebrow>
      <div className="mt-2">{children}</div>
      <p className="text-[11px] mt-2 leading-snug" style={{ color: T.mid }}>
        {footer}
      </p>
    </div>
  );
}

/* ── side column ────────────────────────────────────────────────────── */

function SideColumn({
  title,
  subtitle,
  sideKey,
  inputs,
  isWaiz,
  linkSpend,
  includeFees,
  costPerConversation,
  contacts,
  onPatch,
  onOpenContactRateHelper,
}: {
  title: string;
  subtitle: string;
  sideKey: SideKey;
  inputs: SideInputs;
  isWaiz: boolean;
  linkSpend: boolean;
  includeFees: boolean;
  /** Derived: ad spend ÷ contacts (not loaded fees). */
  costPerConversation: number | null;
  contacts: number;
  onPatch: (key: SideKey, patch: SidePatch) => void;
  /** Current stack only — educational contact-rate helper. */
  onOpenContactRateHelper?: () => void;
}) {
  const spendLocked = isWaiz && linkSpend;

  return (
    <section style={{ ...sidePanel(isWaiz), borderRadius: R }}>
      <header
        className="flex items-baseline justify-between gap-3 px-4 py-3"
        style={{ borderBottom: `1px solid ${isWaiz ? T.amberLine : T.rule}` }}
      >
        <div className="min-w-0">
          <h3
            className="text-[13px] font-bold uppercase"
            style={{ color: isWaiz ? T.amber : T.mid, letterSpacing: "0.11em" }}
          >
            {title}
          </h3>
          <p className="text-[11px] mt-0.5 truncate" style={{ color: T.low }}>
            {subtitle}
          </p>
        </div>
        {isWaiz && (
          <span
            className="text-[9px] font-bold uppercase px-1.5 py-0.5 shrink-0"
            style={{
              color: T.amber,
              background: T.amberSoft,
              border: `1px solid ${T.amberLine}`,
              borderRadius: 2,
              letterSpacing: "0.1em",
            }}
          >
            Ours
          </span>
        )}
      </header>

      <div className="p-4 space-y-3.5">
        <Field
          label="Ad spend"
          fieldKey="ad_spend"
          value={inputs.ad_spend}
          prefix="$"
          lit={isWaiz}
          disabled={spendLocked}
          caption={spendLocked ? "Matched to their budget" : undefined}
          onChange={(v) => onPatch(sideKey, { ad_spend: v })}
        />

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="CPL"
            fieldKey="cpl"
            value={inputs.cpl}
            prefix="$"
            step={0.5}
            lit={isWaiz}
            caption={isWaiz ? rangeCaption("cpl") : undefined}
            onChange={(v) => onPatch(sideKey, { cpl: v })}
          />
          <Field
            label="Leads"
            fieldKey="leads"
            value={inputs.leads}
            step={1}
            lit={isWaiz}
            onChange={(v) => onPatch(sideKey, { leads: v })}
          />
        </div>

        <div>
          <Field
            label="Contact rate"
            fieldKey="contact_rate_pct"
            value={inputs.contact_rate_pct}
            suffix="%"
            step={0.5}
            lit={isWaiz}
            caption={
              isWaiz ? rangeCaption("contact_rate_pct") : "Leads that became a live call"
            }
            onChange={(v) => onPatch(sideKey, { contact_rate_pct: v })}
          />
          {!isWaiz && onOpenContactRateHelper && (
            <button
              type="button"
              onClick={onOpenContactRateHelper}
              className="mt-2 text-[11px] font-semibold underline-offset-4 hover:underline"
              style={{ color: T.amber }}
            >
              Not sure? Work it out from your CRM →
            </button>
          )}
        </div>

        {/* Derived — the number the whole column exists to produce. */}
        <div
          className="relative px-3.5 py-3"
          style={{
            background: isWaiz ? T.amberSoft : "rgba(148,163,184,0.05)",
            border: `1px solid ${isWaiz ? T.amberLine : T.rule}`,
            borderRadius: R,
          }}
        >
          <Flash trigger={costPerConversation} />
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center">
              <Eyebrow color={isWaiz ? T.amber : T.mid}>Cost to talk</Eyebrow>
              <Tip fieldKey="cost_per_conversation" label="cost per conversation" />
            </span>
            <Eyebrow>Auto</Eyebrow>
          </div>
          <Val
            value={costPerConversation}
            format={(v) => money(v)}
            className="block text-[26px] font-semibold mt-1.5 leading-none"
            color={isWaiz ? T.amber : T.hi}
          />
          <p className="text-[10px] mt-2 leading-snug" style={{ color: T.low }}>
            {contacts > 0
              ? `Spend ÷ ${num(contacts)} conversations`
              : "Needs leads and a contact rate"}
          </p>
        </div>

        <Field
          label="Close rate"
          fieldKey="close_rate_pct"
          value={inputs.close_rate_pct}
          suffix="%"
          step={0.5}
          lit={isWaiz}
          caption={
            isWaiz ? rangeCaption("close_rate_pct") : "Of conversations that fund"
          }
          onChange={(v) => onPatch(sideKey, { close_rate_pct: v })}
        />
        <Field
          label="Avg commission"
          fieldKey="avg_commission"
          value={inputs.avg_commission}
          prefix="$"
          lit={isWaiz}
          caption={
            isWaiz
              ? "DSCR / target product pay — set independently"
              : "Per close on their current product mix"
          }
          onChange={(v) => onPatch(sideKey, { avg_commission: v })}
        />
        {includeFees && (
          <Field
            label={isWaiz ? "Program fee" : "Vendor fee"}
            fieldKey="program_fee"
            value={inputs.program_fee}
            prefix="$"
            lit={isWaiz}
            onChange={(v) => onPatch(sideKey, { program_fee: v })}
          />
        )}
      </div>
    </section>
  );
}

/* ── ledger ─────────────────────────────────────────────────────────── */

function LedgerRow({
  label,
  note,
  current,
  waiz,
  delta,
  deltaPositive,
  emphasize,
}: {
  label: string;
  note?: string;
  current: React.ReactNode;
  waiz: React.ReactNode;
  delta: React.ReactNode;
  deltaPositive: boolean;
  emphasize?: boolean;
}) {
  return (
    <div
      className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-3 items-baseline px-4 py-3"
      style={{
        borderTop: `1px solid ${T.ruleSoft}`,
        background: emphasize ? "rgba(245,165,36,0.045)" : undefined,
      }}
    >
      <div className="min-w-0">
        <p
          className="text-[12px]"
          style={{ color: emphasize ? T.hi : T.mid, fontWeight: emphasize ? 600 : 400 }}
        >
          {label}
        </p>
        {note && (
          <p className="text-[10px] mt-0.5" style={{ color: T.low }}>
            {note}
          </p>
        )}
      </div>
      <div className="text-right text-[13px]" style={{ color: T.mid }}>
        {current}
      </div>
      <div
        className="text-right text-[13px] font-medium"
        style={{ color: emphasize ? T.amber : T.hi }}
      >
        {waiz}
      </div>
      <div
        className="text-right text-[13px] font-semibold"
        style={{ color: deltaPositive ? T.good : T.bad }}
      >
        {delta}
      </div>
    </div>
  );
}

/* ── page ───────────────────────────────────────────────────────────── */

export default function LeadSourceRoiCalculator({
  variant,
  initialEncoded,
  onStateChange,
}: Props) {
  const [dismissedLoadError, setDismissedLoadError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [contactHelperOpen, setContactHelperOpen] = useState(false);
  const [state, setState] = useState<CompareState>(() => {
    if (initialEncoded) {
      const decoded = decodeCompareState(initialEncoded);
      if (decoded) return decoded;
    }
    return createDefaultState();
  });

  const decodeFailed = useMemo(
    () => Boolean(initialEncoded) && decodeCompareState(initialEncoded!) == null,
    [initialEncoded],
  );
  const loadError = decodeFailed && !dismissedLoadError;

  useEffect(() => {
    onStateChange?.(encodeCompareState(state));
  }, [state, onStateChange]);

  const result = useMemo(() => simulateCompare(state), [state]);

  const cpcCurrent = result.current.cost_per_conversation;
  const cpcWaiz = result.waiz.cost_per_conversation;
  const cpcSavings = cpcCurrent != null && cpcWaiz != null ? cpcCurrent - cpcWaiz : null;

  const deltaNet = result.delta.net_commission;

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

  return (
    <div
      className="lsr flex-1 min-h-0 overflow-auto p-4 md:p-6 space-y-4"
      style={{ color: T.hi, background: T.base }}
    >
      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
        <div>
          <Eyebrow color={T.amber}>Lead source bake-off</Eyebrow>
          <h2
            className="text-[22px] font-bold mt-1 leading-none"
            style={{ color: T.hi, letterSpacing: "-0.01em" }}
          >
            {TOOL_TITLE}
          </h2>
          <p className="text-[12px] mt-1.5 max-w-lg" style={{ color: T.mid }}>
            {TOOL_SUBTITLE}
          </p>
          {loadError && (
            <p className="text-[11px] mt-2" style={{ color: T.amber }}>
              Couldn&apos;t load that shared link — showing the demo numbers.
            </p>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setDismissedLoadError(true);
              setState(createDefaultState());
            }}
            className="px-3 py-1.5 text-[11px] font-semibold uppercase transition-colors hover:brightness-125"
            style={{
              background: T.panel,
              border: BORDER,
              borderRadius: R,
              color: T.mid,
              letterSpacing: "0.08em",
            }}
          >
            Reset
          </button>
          <button
            type="button"
            onClick={copyPublicLink}
            className="px-3 py-1.5 text-[11px] font-semibold uppercase transition-colors hover:brightness-125"
            style={{
              background: T.amberSoft,
              border: `1px solid ${T.amberLine}`,
              borderRadius: R,
              color: T.amber,
              letterSpacing: "0.08em",
            }}
          >
            {copied ? "Link copied" : "Copy link"}
          </button>
        </div>
      </div>

      {/* Controls */}
      <div
        className="flex flex-wrap items-center gap-x-7 gap-y-3 px-4 py-2.5"
        style={{ background: T.panel, border: BORDER, borderRadius: R }}
      >
        <Segmented
          label="Cost model"
          value={state.include_fees ? "fees" : "media"}
          options={[
            { value: "media", label: "Ad spend only" },
            { value: "fees", label: "Include program fee" },
          ]}
          onChange={(v) => setState((s) => setIncludeFees(s, v === "fees"))}
        />
        <Switch
          label="Match our budget to theirs"
          checked={state.link_spend}
          onChange={(v) => setState((s) => setLinkSpend(s, v))}
        />
        <span className="text-[11px]" style={{ color: T.low }}>
          Commission is always set separately per side
        </span>
      </div>

      {/* Verdict band — the three numbers that carry the call */}
      <div
        className="relative grid grid-cols-1 md:grid-cols-3"
        style={{
          background: `linear-gradient(115deg, rgba(52,211,153,0.06), ${T.panel} 55%)`,
          border: `1px solid ${deltaNet >= 0 ? T.goodLine : "rgba(248,113,113,0.3)"}`,
          borderRadius: R,
        }}
      >
        <Flash trigger={deltaNet} />
        <VerdictCell
          eyebrow="They'd make"
          accent={deltaNet >= 0 ? T.good : T.bad}
          footer={
            <>
              {money(result.current.net_commission)} today →{" "}
              <span style={{ color: T.hi }}>{money(result.waiz.net_commission)}</span> with
              us, same budget
            </>
          }
        >
          <Val
            value={deltaNet}
            format={(v) => (v == null ? "—" : signed(v, (x) => money(x)))}
            className="text-[38px] md:text-[42px] font-semibold leading-none"
            color={deltaNet >= 0 ? T.good : T.bad}
          />
        </VerdictCell>

        <div style={{ borderLeft: `1px solid ${T.rule}` }}>
          <VerdictCell
            eyebrow="Cost to talk"
            footer={
              cpcSavings == null
                ? "Set leads and a contact rate on both sides"
                : cpcSavings > 0
                  ? `${money(cpcSavings)} cheaper per conversation`
                  : cpcSavings < 0
                    ? `${money(Math.abs(cpcSavings))} more per conversation`
                    : "Identical on these inputs"
            }
          >
            <span className="flex items-baseline gap-2.5 flex-wrap">
              <Val
                value={cpcCurrent}
                format={(v) => money(v)}
                className="text-[26px] font-medium leading-none"
                color={T.mid}
              />
              <span className="lsr-data text-lg leading-none" style={{ color: T.low }}>
                →
              </span>
              <Val
                value={cpcWaiz}
                format={(v) => money(v)}
                className="text-[32px] font-semibold leading-none"
                color={T.amber}
              />
            </span>
          </VerdictCell>
        </div>

        <div style={{ borderLeft: `1px solid ${T.rule}` }}>
          <VerdictCell
            eyebrow="Funded deals"
            footer={
              <>
                {num(result.current.deals)} → {num(result.waiz.deals)} per month at{" "}
                {mult(result.waiz.roi_multiple)} ROI
              </>
            }
          >
            <Val
              value={result.delta.deals}
              format={(v) => (v == null ? "—" : signed(v, (x) => num(x)))}
              className="text-[38px] md:text-[42px] font-semibold leading-none"
              color={result.delta.deals >= 0 ? T.good : T.bad}
            />
          </VerdictCell>
        </div>
      </div>

      {/* Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SideColumn
          title="Their source"
          subtitle="What they run today"
          sideKey="current"
          inputs={state.current}
          isWaiz={false}
          linkSpend={state.link_spend}
          includeFees={state.include_fees}
          costPerConversation={result.current.cost_per_conversation}
          contacts={result.current.contacts}
          onPatch={onPatch}
          onOpenContactRateHelper={() => setContactHelperOpen(true)}
        />
        <SideColumn
          title="With Waiz"
          subtitle="Same budget, our lead engine"
          sideKey="waiz"
          inputs={state.waiz}
          isWaiz
          linkSpend={state.link_spend}
          includeFees={state.include_fees}
          costPerConversation={result.waiz.cost_per_conversation}
          contacts={result.waiz.contacts}
          onPatch={onPatch}
        />
      </div>

      <ContactRateHelperModal
        open={contactHelperOpen}
        onClose={() => setContactHelperOpen(false)}
        initialLeads={state.current.leads}
        onApply={(pct) => {
          setState((s) => patchSide(s, "current", { contact_rate_pct: pct }));
        }}
      />

      {/* Ledger */}
      <div style={{ background: T.panel, border: BORDER, borderRadius: R }}>
        <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-3 px-4 py-2.5">
          <Eyebrow>Monthly outcome</Eyebrow>
          <span className="text-right">
            <Eyebrow>Theirs</Eyebrow>
          </span>
          <span className="text-right">
            <Eyebrow color={T.amber}>With Waiz</Eyebrow>
          </span>
          <span className="text-right">
            <Eyebrow>Delta</Eyebrow>
          </span>
        </div>

        <LedgerRow
          label="Conversations"
          note="Live calls, not texts"
          deltaPositive={result.delta.contacts >= 0}
          current={<Val value={result.current.contacts} format={(v) => num(v)} />}
          waiz={<Val value={result.waiz.contacts} format={(v) => num(v)} />}
          delta={
            <Val
              value={result.delta.contacts}
              format={(v) => (v == null ? "—" : signed(v, (x) => num(x)))}
            />
          }
        />
        <LedgerRow
          label="Funded deals"
          note={`Range ${num(result.waiz_worst.deals)} – ${num(result.waiz_best.deals)}`}
          deltaPositive={result.delta.deals >= 0}
          current={<Val value={result.current.deals} format={(v) => num(v)} />}
          waiz={<Val value={result.waiz.deals} format={(v) => num(v)} />}
          delta={
            <Val
              value={result.delta.deals}
              format={(v) => (v == null ? "—" : signed(v, (x) => num(x)))}
            />
          }
        />
        <LedgerRow
          label="Net commission"
          note={`Range ${money(result.waiz_worst.net_commission)} – ${money(result.waiz_best.net_commission)}`}
          emphasize
          deltaPositive={deltaNet >= 0}
          current={<Val value={result.current.net_commission} format={(v) => money(v)} />}
          waiz={<Val value={result.waiz.net_commission} format={(v) => money(v)} />}
          delta={
            <Val
              value={deltaNet}
              format={(v) => (v == null ? "—" : signed(v, (x) => money(x)))}
            />
          }
        />
        <LedgerRow
          label="Return on ad spend"
          note={
            result.current.roi_pct != null && result.waiz.roi_pct != null
              ? `${(result.current.roi_pct * 100).toFixed(0)}% → ${(result.waiz.roi_pct * 100).toFixed(0)}%`
              : undefined
          }
          deltaPositive={(result.delta.roi_multiple ?? 0) >= 0}
          current={<Val value={result.current.roi_multiple} format={(v) => mult(v)} />}
          waiz={<Val value={result.waiz.roi_multiple} format={(v) => mult(v)} />}
          delta={
            <Val
              value={result.delta.roi_multiple}
              format={(v) => (v == null ? "—" : signed(v, (x) => mult(x)))}
            />
          }
        />
      </div>

      <ScaleScenariosSection state={state} />

      <p className="text-[11px] leading-relaxed" style={{ color: T.low }}>
        {PUBLIC_DISCLAIMER}
        {variant === "public" ? " Full sandbox — edit any field on either side." : ""}
      </p>
    </div>
  );
}

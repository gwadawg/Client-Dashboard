"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ACCOUNT_TYPES,
  ACQUISITION_COST_CHANNELS,
  ACQUISITION_COST_CHANNEL_LABELS,
  CEO_BUCKETS,
  CEO_BUCKET_LABELS,
  FULFILLMENT_LINES,
  FULFILLMENT_LINE_LABELS,
  suggestRuleNeedle,
  type AccountType,
  type AcquisitionCostChannel,
  type CeoBucket,
  type FulfillmentLine,
} from "@/lib/expenses";

type FinanceAccount = {
  id: string;
  name: string;
  institution: string | null;
  account_type: AccountType;
  entity: string | null;
  is_business: boolean;
  active: boolean;
  last4: string | null;
};

type Expense = {
  id: string;
  occurred_on: string;
  amount: number;
  account_id: string | null;
  source: string;
  merchant_raw: string | null;
  memo: string | null;
  ceo_bucket: CeoBucket;
  subcategory: string | null;
  fulfillment_line: FulfillmentLine | null;
  acquisition_cost_channel: AcquisitionCostChannel | null;
  exclude_from_pnl: boolean;
  categorized_by: string | null;
};

type ViewTab = "ledger" | "pending";

const fieldStyle: React.CSSProperties = {
  background: "#0f2040",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#e2e8f0",
  borderRadius: "0.375rem",
  padding: "0.4rem 0.6rem",
  fontSize: "0.8125rem",
  outline: "none",
};

const BUCKET_COLOR: Record<CeoBucket, string> = {
  cac: "#38bdf8",
  fulfillment: "#34d399",
  overhead: "#a78bfa",
  passthrough: "#94a3b8",
  owner_draw: "#fbbf24",
  personal: "#fb7185",
  uncategorized: "#f59e0b",
};

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Month options from late 2024 through current (for Ledger filter). */
function monthOptions(): string[] {
  const out: string[] = [];
  const end = new Date();
  const cur = new Date(2024, 9, 1); // Oct 2024
  while (cur <= end) {
    out.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`);
    cur.setMonth(cur.getMonth() + 1);
  }
  return out.reverse();
}

function defaultExclude(bucket: CeoBucket): boolean {
  return bucket === "personal" || bucket === "owner_draw" || bucket === "passthrough";
}

export default function ExpenseManager() {
  const [tab, setTab] = useState<ViewTab>("pending");
  const [month, setMonth] = useState(currentMonth);
  /** Empty string = all months (Ledger only). */
  const [accountFilter, setAccountFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [mapExpense, setMapExpense] = useState<Expense | null>(null);
  const [csvText, setCsvText] = useState("");
  const [importAccountId, setImportAccountId] = useState("");

  const [mapForm, setMapForm] = useState({
    ceo_bucket: "overhead" as CeoBucket,
    subcategory: "",
    fulfillment_line: "" as "" | FulfillmentLine,
    acquisition_cost_channel: "" as "" | AcquisitionCostChannel,
    create_rule: true,
    rule_match_value: "",
    apply_to_matching: true,
    exclude_from_pnl: false,
  });

  const [form, setForm] = useState({
    occurred_on: new Date().toISOString().slice(0, 10),
    amount: "",
    merchant_raw: "",
    memo: "",
    account_id: "",
    ceo_bucket: "uncategorized" as CeoBucket,
    subcategory: "",
    fulfillment_line: "" as "" | FulfillmentLine,
    acquisition_cost_channel: "" as "" | AcquisitionCostChannel,
  });

  const [acctForm, setAcctForm] = useState({
    name: "",
    institution: "",
    account_type: "credit_card" as AccountType,
    entity: "Waiz Media",
    last4: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ limit: "2000" });
    if (tab === "pending") {
      params.set("pending", "1");
    } else if (month) {
      params.set("month", month);
    }
    if (accountFilter) params.set("account_id", accountFilter);

    const [expRes, acctRes] = await Promise.all([
      fetch(`/api/expenses?${params}`),
      fetch("/api/finance-accounts"),
    ]);
    const expData = await expRes.json();
    const acctData = await acctRes.json();
    if (!expRes.ok) setError(expData.error ?? "Failed to load expenses");
    else {
      setExpenses(expData.expenses ?? []);
      setPendingCount(expData.pending_count ?? 0);
    }
    if (acctRes.ok) setAccounts(acctData.accounts ?? []);
    setLoading(false);
  }, [tab, month, accountFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const accountName = useMemo(() => {
    const m = new Map(accounts.map(a => [a.id, a.name]));
    return (id: string | null) => (id ? m.get(id) ?? "—" : "—");
  }, [accounts]);

  const totals = useMemo(() => {
    const by: Record<string, number> = {};
    let pnl = 0;
    for (const e of expenses) {
      by[e.ceo_bucket] = (by[e.ceo_bucket] ?? 0) + Number(e.amount);
      if (!e.exclude_from_pnl && ["cac", "fulfillment", "overhead"].includes(e.ceo_bucket)) {
        pnl += Number(e.amount);
      }
    }
    return { by, pnl, count: expenses.length };
  }, [expenses]);

  function openMap(e: Expense) {
    const bucket = e.ceo_bucket === "uncategorized" ? "overhead" : e.ceo_bucket;
    setMapForm({
      ceo_bucket: bucket,
      subcategory: e.subcategory ?? "",
      fulfillment_line: e.fulfillment_line ?? "",
      acquisition_cost_channel: e.acquisition_cost_channel ?? "",
      create_rule: true,
      rule_match_value: suggestRuleNeedle(e.merchant_raw),
      apply_to_matching: true,
      exclude_from_pnl: e.exclude_from_pnl || defaultExclude(bucket),
    });
    setMapExpense(e);
  }

  async function toggleExclude(e: Expense) {
    setBusy(e.id);
    setError("");
    setMessage("");
    const next = !e.exclude_from_pnl;
    const res = await fetch(`/api/expenses/${e.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exclude_from_pnl: next }),
    });
    setBusy(null);
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? "Failed to update exclude");
      return;
    }
    setMessage(next
      ? `Excluded from OpEx reports — ${e.merchant_raw ?? "charge"}`
      : `Included in OpEx reports again — ${e.merchant_raw ?? "charge"}`);
    load();
  }

  async function submitMap(ev: React.FormEvent) {
    ev.preventDefault();
    if (!mapExpense) return;
    if (mapForm.ceo_bucket === "fulfillment" && !mapForm.fulfillment_line) {
      setError("Pick a COGS category (media buying, call center, client success, or delivery tech)");
      return;
    }
    if (mapForm.ceo_bucket === "cac" && !mapForm.acquisition_cost_channel) {
      setError("Pick an acquisition channel (creative, Meta reconcile, labor…)");
      return;
    }
    setBusy("map");
    setError("");
    setMessage("");
    const res = await fetch(`/api/expenses/${mapExpense.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ceo_bucket: mapForm.ceo_bucket,
        subcategory: mapForm.subcategory || null,
        fulfillment_line:
          mapForm.ceo_bucket === "fulfillment" ? mapForm.fulfillment_line || null : null,
        acquisition_cost_channel:
          mapForm.ceo_bucket === "cac" ? mapForm.acquisition_cost_channel || null : null,
        exclude_from_pnl:
          mapForm.exclude_from_pnl ||
          defaultExclude(mapForm.ceo_bucket) ||
          mapForm.acquisition_cost_channel === "meta_media",
        create_rule: mapForm.create_rule && mapForm.ceo_bucket !== "uncategorized",
        rule_match_value: mapForm.rule_match_value,
        apply_to_matching: mapForm.create_rule && mapForm.apply_to_matching,
      }),
    });
    const d = await res.json();
    setBusy(null);
    if (!res.ok) {
      setError(d.error ?? "Map failed");
      return;
    }
    const parts = [`Mapped to ${CEO_BUCKET_LABELS[mapForm.ceo_bucket]}`];
    if (mapForm.ceo_bucket === "fulfillment" && mapForm.fulfillment_line) {
      parts.push(FULFILLMENT_LINE_LABELS[mapForm.fulfillment_line]);
    }
    if (d.rule) parts.push(`rule “${d.rule.name}” saved for future imports`);
    if (d.applied_matching) parts.push(`${d.applied_matching} other matching charges updated`);
    else if (mapForm.create_rule && mapForm.apply_to_matching) {
      parts.push("no other historical matches found");
    }
    setMessage(parts.join(" · "));
    setMapExpense(null);
    load();
  }

  async function seedRules() {
    setBusy("seed");
    setMessage("");
    const res = await fetch("/api/expense-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seed: true }),
    });
    const d = await res.json();
    setBusy(null);
    if (!res.ok) setError(d.error ?? "Seed failed");
    else setMessage(`Seeded ${d.seeded ?? 0} category rules`);
  }

  async function applyRulesToPending() {
    setBusy("apply-rules");
    setMessage("");
    const res = await fetch("/api/expense-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apply: true, only_uncategorized: true }),
    });
    const d = await res.json();
    setBusy(null);
    if (!res.ok) setError(d.error ?? "Apply rules failed");
    else {
      setMessage(`Applied rules to ${d.applied ?? 0} of ${d.scanned ?? 0} pending charges`);
      load();
    }
  }

  async function rollupMonth() {
    setBusy("rollup");
    setMessage("");
    const res = await fetch("/api/expenses/rollup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month }),
    });
    const d = await res.json();
    setBusy(null);
    if (!res.ok) {
      setError(d.error ?? "Rollup failed");
      return;
    }
    const r = d.rollups?.[0];
    setMessage(
      r
        ? `Refreshed ${month}: CAC ${money(r.marketing_spend)} · COGS ${money(r.delivery_costs)} · OpEx ${money(r.operating_expenses)}`
        : "KPI refresh complete",
    );
  }

  async function addExpense(e: React.FormEvent) {
    e.preventDefault();
    setBusy("add");
    setError("");
    const res = await fetch("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        occurred_on: form.occurred_on,
        amount: Number(form.amount),
        merchant_raw: form.merchant_raw,
        memo: form.memo || null,
        account_id: form.account_id || null,
        ceo_bucket: form.ceo_bucket === "uncategorized" ? undefined : form.ceo_bucket,
        subcategory: form.subcategory || null,
        fulfillment_line:
          form.ceo_bucket === "fulfillment" ? form.fulfillment_line || null : null,
        acquisition_cost_channel:
          form.ceo_bucket === "cac" ? form.acquisition_cost_channel || null : null,
      }),
    });
    const d = await res.json();
    setBusy(null);
    if (!res.ok) {
      setError(d.error ?? "Failed to add");
      return;
    }
    setShowAdd(false);
    setForm(f => ({
      ...f,
      amount: "",
      merchant_raw: "",
      memo: "",
      subcategory: "",
      fulfillment_line: "",
    }));
    load();
  }

  async function addAccount(e: React.FormEvent) {
    e.preventDefault();
    setBusy("account");
    const res = await fetch("/api/finance-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(acctForm),
    });
    const d = await res.json();
    setBusy(null);
    if (!res.ok) {
      setError(d.error ?? "Failed to add account");
      return;
    }
    setShowAccount(false);
    setAcctForm({ name: "", institution: "", account_type: "credit_card", entity: "Waiz Media", last4: "" });
    load();
  }

  async function patchBucket(id: string, ceo_bucket: CeoBucket) {
    if (ceo_bucket === "uncategorized") {
      setBusy(id);
      const res = await fetch(`/api/expenses/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ceo_bucket }),
      });
      setBusy(null);
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Update failed");
        return;
      }
      load();
      return;
    }
    const row = expenses.find(e => e.id === id);
    if (row) openMap({ ...row, ceo_bucket });
  }

  async function runImport(dryRun: boolean) {
    setBusy(dryRun ? "preview" : "import");
    setError("");
    setMessage("");
    const res = await fetch("/api/expenses/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        csv: csvText,
        account_id: importAccountId || null,
        dryRun,
        apply_rules: true,
      }),
    });
    const d = await res.json();
    setBusy(null);
    if (!res.ok) {
      setError(d.error ?? "Import failed");
      return;
    }
    if (dryRun) {
      setMessage(
        `Preview: ${d.would_insert} new · ${d.skipped_duplicate ?? 0} dupes · ${d.skipped_invalid ?? 0} invalid${
          d.skipped_credit != null ? ` · ${d.skipped_credit} credits skipped` : ""
        }`,
      );
    } else {
      setMessage(`Imported ${d.inserted} charges`);
      setShowImport(false);
      setCsvText("");
      setTab("pending");
      load();
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold" style={{ color: "#e2e8f0" }}>
            Raw charge data
          </h2>
          <p className="text-sm mt-0.5 max-w-2xl" style={{ color: "#64748b" }}>
            Unmapped bank charges land in Pending. Map a Type (and optionally save a rule) so the
            next import auto-classifies them.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: "rgba(56,189,248,0.15)", color: "#38bdf8" }}
          >
            Add charge
          </button>
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: "rgba(167,139,250,0.15)", color: "#a78bfa" }}
          >
            Import CSV
          </button>
          <button
            type="button"
            onClick={() => setShowAccount(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: "rgba(148,163,184,0.12)", color: "#94a3b8" }}
          >
            Add account
          </button>
          <button
            type="button"
            onClick={seedRules}
            disabled={busy === "seed"}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: "rgba(148,163,184,0.12)", color: "#94a3b8" }}
          >
            Seed rules
          </button>
          <button
            type="button"
            onClick={applyRulesToPending}
            disabled={busy === "apply-rules"}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: "rgba(56,189,248,0.15)", color: "#38bdf8" }}
          >
            Apply rules to pending
          </button>
          {tab === "ledger" && month && (
            <button
              type="button"
              onClick={rollupMonth}
              disabled={busy === "rollup"}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background: "rgba(52,211,153,0.15)", color: "#34d399" }}
            >
              Refresh KPIs {month}
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ background: "rgba(15,32,64,0.9)" }}>
        <button
          type="button"
          onClick={() => setTab("pending")}
          className="px-3 py-1.5 rounded-md text-xs font-semibold"
          style={{
            background: tab === "pending" ? "rgba(245,158,11,0.2)" : "transparent",
            color: tab === "pending" ? "#fbbf24" : "#64748b",
          }}
        >
          Pending{pendingCount > 0 ? ` (${pendingCount})` : ""}
        </button>
        <button
          type="button"
          onClick={() => setTab("ledger")}
          className="px-3 py-1.5 rounded-md text-xs font-semibold"
          style={{
            background: tab === "ledger" ? "rgba(56,189,248,0.15)" : "transparent",
            color: tab === "ledger" ? "#38bdf8" : "#64748b",
          }}
        >
          Ledger
        </button>
      </div>

      {(error || message) && (
        <div
          className="text-sm px-3 py-2 rounded-lg"
          style={{
            background: error ? "rgba(239,68,68,0.12)" : "rgba(52,211,153,0.1)",
            color: error ? "#f87171" : "#34d399",
          }}
        >
          {error || message}
        </div>
      )}

      {tab === "ledger" && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs" style={{ color: "#64748b" }}>
              Month
              <select
                value={month}
                onChange={e => setMonth(e.target.value)}
                style={{ ...fieldStyle, marginLeft: 8 }}
              >
                <option value="">All months</option>
                {monthOptions().map(m => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs flex items-center gap-2" style={{ color: "#64748b" }}>
              Account
              <select
                value={accountFilter}
                onChange={e => setAccountFilter(e.target.value)}
                style={fieldStyle}
              >
                <option value="">All</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-xs ml-auto" style={{ color: "#64748b" }}>
              {totals.count} charges · OpEx in reports {money(totals.pnl)}
              {totals.count >= 2000 ? " · showing first 2000" : ""}
            </span>
          </div>

          {month && (
            <p className="text-xs" style={{ color: "#64748b" }}>
              Ledger rule: Total Costs sheet through Jan 2026 · Chase bank from Feb 2026 onward
              (plus late-2024 Chase before the sheet). To drop a charge from KPI / OpEx, Map it
              and check <span style={{ color: "#fbbf24" }}>Exclude from reports</span>, or set
              Type to Personal / Owner draw / Passthrough. Dashboard KPIs update automatically
              when you save; use Refresh KPIs only if you need a manual recompute.
            </p>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {(["cac", "fulfillment", "overhead", "uncategorized"] as CeoBucket[]).map(b => (
              <button
                key={b}
                type="button"
                onClick={() => {
                  if (b === "uncategorized") setTab("pending");
                }}
                className="rounded-lg px-3 py-2 text-left"
                style={{ background: "rgba(15,32,64,0.8)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <div className="text-[10px] uppercase tracking-wide" style={{ color: BUCKET_COLOR[b] }}>
                  {CEO_BUCKET_LABELS[b]}
                </div>
                <div className="text-sm font-semibold mt-0.5" style={{ color: "#e2e8f0" }}>
                  {money(totals.by[b] ?? 0)}
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {tab === "pending" && (
        <div
          className="rounded-lg px-3 py-2 text-sm"
          style={{
            background: "rgba(245,158,11,0.08)",
            border: "1px solid rgba(245,158,11,0.2)",
            color: "#fbbf24",
          }}
        >
          {pendingCount} charge{pendingCount === 1 ? "" : "s"} need a Type. Map once, or save a rule so
          future imports match automatically.
        </div>
      )}

      {loading ? (
        <p className="text-sm" style={{ color: "#64748b" }}>
          Loading…
        </p>
      ) : expenses.length === 0 ? (
        <p className="text-sm" style={{ color: "#64748b" }}>
          {tab === "pending"
            ? "Pending queue is clear — nothing left to map."
            : "No expenses for this filter. Add a charge or import a CSV."}
        </p>
      ) : (
        <div className="overflow-auto rounded-lg" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
          <table className="w-full text-left text-sm">
            <thead>
              <tr style={{ background: "#0a1628", color: "#64748b" }}>
                <th className="px-3 py-2 font-medium text-xs">Date</th>
                <th className="px-3 py-2 font-medium text-xs">Merchant</th>
                <th className="px-3 py-2 font-medium text-xs">Account</th>
                <th className="px-3 py-2 font-medium text-xs text-right">Amount</th>
                <th className="px-3 py-2 font-medium text-xs">
                  {tab === "pending" ? "Action" : "Bucket"}
                </th>
                {tab === "ledger" && (
                  <>
                    <th className="px-3 py-2 font-medium text-xs">Source</th>
                    <th className="px-3 py-2 font-medium text-xs">Reports</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {expenses.map(e => (
                <tr
                  key={e.id}
                  style={{
                    borderTop: "1px solid rgba(255,255,255,0.04)",
                    opacity: e.exclude_from_pnl ? 0.55 : 1,
                  }}
                >
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: "#94a3b8" }}>
                    {e.occurred_on}
                  </td>
                  <td className="px-3 py-2" style={{ color: "#e2e8f0" }}>
                    <div>{e.merchant_raw ?? "—"}</div>
                    {e.memo && (
                      <div
                        className="text-xs mt-0.5 line-clamp-2"
                        style={{ color: "#475569", maxWidth: 420 }}
                        title={e.memo}
                      >
                        {e.memo}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs" style={{ color: "#64748b" }}>
                    {accountName(e.account_id)}
                  </td>
                  <td className="px-3 py-2 text-right font-medium" style={{ color: "#e2e8f0" }}>
                    {money(Number(e.amount))}
                  </td>
                  <td className="px-3 py-2">
                    {tab === "pending" ? (
                      <button
                        type="button"
                        onClick={() => openMap(e)}
                        className="px-2.5 py-1 rounded-md text-xs font-semibold"
                        style={{ background: "rgba(245,158,11,0.18)", color: "#fbbf24" }}
                      >
                        Map
                      </button>
                    ) : (
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <select
                            value={e.ceo_bucket}
                            disabled={busy === e.id}
                            onChange={ev => patchBucket(e.id, ev.target.value as CeoBucket)}
                            style={{
                              ...fieldStyle,
                              color: BUCKET_COLOR[e.ceo_bucket],
                              padding: "0.25rem 0.4rem",
                              fontSize: "0.75rem",
                            }}
                          >
                            {CEO_BUCKETS.map(b => (
                              <option key={b} value={b}>
                                {CEO_BUCKET_LABELS[b]}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => openMap(e)}
                            className="px-2 py-1 rounded-md text-[10px] font-semibold"
                            style={{ background: "rgba(255,255,255,0.06)", color: "#94a3b8" }}
                          >
                            Map
                          </button>
                        </div>
                        {e.ceo_bucket === "fulfillment" && e.fulfillment_line && (
                          <div className="text-[10px] mt-1" style={{ color: "#34d399" }}>
                            {FULFILLMENT_LINE_LABELS[e.fulfillment_line]}
                          </div>
                        )}
                        {e.ceo_bucket === "fulfillment" && !e.fulfillment_line && (
                          <div className="text-[10px] mt-1" style={{ color: "#f59e0b" }}>
                            Needs COGS category
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  {tab === "ledger" && (
                    <>
                      <td className="px-3 py-2 text-xs" style={{ color: "#475569" }}>
                        {e.source}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          disabled={busy === e.id}
                          onClick={() => toggleExclude(e)}
                          className="px-2 py-1 rounded-md text-[10px] font-semibold disabled:opacity-40"
                          style={{
                            background: e.exclude_from_pnl
                              ? "rgba(148,163,184,0.18)"
                              : "rgba(239,68,68,0.12)",
                            color: e.exclude_from_pnl ? "#94a3b8" : "#f87171",
                          }}
                          title={
                            e.exclude_from_pnl
                              ? "Currently excluded — click to include in OpEx again"
                              : "Exclude this charge from OpEx / KPI rollups"
                          }
                        >
                          {e.exclude_from_pnl ? "Excluded" : "Exclude"}
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {mapExpense && (
        <Modal title="Map charge" onClose={() => setMapExpense(null)}>
          <form onSubmit={submitMap} className="space-y-3">
            <div
              className="rounded-lg px-3 py-2 text-xs space-y-1"
              style={{ background: "rgba(15,32,64,0.8)", color: "#94a3b8" }}
            >
              <div style={{ color: "#e2e8f0" }}>{mapExpense.merchant_raw ?? "—"}</div>
              <div>
                {mapExpense.occurred_on} · {money(Number(mapExpense.amount))}
              </div>
            </div>
            <Field label="Type (CEO bucket)">
              <select
                value={mapForm.ceo_bucket}
                onChange={e => {
                  const b = e.target.value as CeoBucket;
                  setMapForm(f => ({
                    ...f,
                    ceo_bucket: b,
                    fulfillment_line: b === "fulfillment" ? f.fulfillment_line : "",
                    acquisition_cost_channel: b === "cac" ? f.acquisition_cost_channel : "",
                    exclude_from_pnl: defaultExclude(b),
                  }));
                }}
                style={{ ...fieldStyle, width: "100%" }}
              >
                {CEO_BUCKETS.filter(b => b !== "uncategorized").map(b => (
                  <option key={b} value={b}>
                    {CEO_BUCKET_LABELS[b]}
                  </option>
                ))}
              </select>
            </Field>
            {mapForm.ceo_bucket === "fulfillment" && (
              <Field label="COGS category">
                <select
                  required
                  value={mapForm.fulfillment_line}
                  onChange={e =>
                    setMapForm(f => ({
                      ...f,
                      fulfillment_line: e.target.value as "" | FulfillmentLine,
                    }))
                  }
                  style={{ ...fieldStyle, width: "100%" }}
                >
                  <option value="">Select…</option>
                  {FULFILLMENT_LINES.map(line => (
                    <option key={line} value={line}>
                      {FULFILLMENT_LINE_LABELS[line]}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] mt-1" style={{ color: "#64748b" }}>
                  Delivery line for margins (keep Subcategory for payroll / commissions / software).
                </p>
              </Field>
            )}
            {mapForm.ceo_bucket === "cac" && (
              <Field label="Acquisition channel">
                <select
                  required
                  value={mapForm.acquisition_cost_channel}
                  onChange={e => {
                    const ch = e.target.value as "" | AcquisitionCostChannel;
                    setMapForm(f => ({
                      ...f,
                      acquisition_cost_channel: ch,
                      exclude_from_pnl: ch === "meta_media" ? true : f.exclude_from_pnl,
                    }));
                  }}
                  style={{ ...fieldStyle, width: "100%" }}
                >
                  <option value="">Select…</option>
                  {ACQUISITION_COST_CHANNELS.map(ch => (
                    <option key={ch} value={ch}>
                      {ACQUISITION_COST_CHANNEL_LABELS[ch]}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] mt-1" style={{ color: "#64748b" }}>
                  Meta media rows are reconcile-only — Graph insights feed CAC math.
                </p>
              </Field>
            )}
            <Field label="Subcategory (optional)">
              <input
                value={mapForm.subcategory}
                onChange={e => setMapForm(f => ({ ...f, subcategory: e.target.value }))}
                placeholder="software, payroll, commissions…"
                style={{ ...fieldStyle, width: "100%" }}
              />
            </Field>
            <label
              className="flex items-start gap-2 text-xs cursor-pointer rounded-lg px-3 py-2"
              style={{
                color: "#e2e8f0",
                background: mapForm.exclude_from_pnl ? "rgba(239,68,68,0.1)" : "rgba(15,32,64,0.6)",
                border: `1px solid ${mapForm.exclude_from_pnl ? "rgba(239,68,68,0.35)" : "rgba(255,255,255,0.06)"}`,
              }}
            >
              <input
                type="checkbox"
                checked={mapForm.exclude_from_pnl}
                onChange={e => setMapForm(f => ({ ...f, exclude_from_pnl: e.target.checked }))}
                className="mt-0.5"
              />
              <span>
                <span className="font-semibold" style={{ color: mapForm.exclude_from_pnl ? "#f87171" : "#e2e8f0" }}>
                  Exclude completely from reports
                </span>
                <span className="block mt-0.5" style={{ color: "#64748b" }}>
                  Stays on the ledger for audit, but drops out of OpEx / CAC / COGS KPI rollups.
                  Personal, Owner draw, and Passthrough types do this automatically.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-xs cursor-pointer" style={{ color: "#e2e8f0" }}>
              <input
                type="checkbox"
                checked={mapForm.create_rule}
                onChange={e => setMapForm(f => ({ ...f, create_rule: e.target.checked }))}
                className="mt-0.5"
              />
              Always treat this merchant this way (save rule for future imports)
            </label>
            {mapForm.create_rule && (
              <>
                <Field label="Match merchants containing">
                  <input
                    required
                    value={mapForm.rule_match_value}
                    onChange={e => setMapForm(f => ({ ...f, rule_match_value: e.target.value }))}
                    style={{ ...fieldStyle, width: "100%" }}
                  />
                </Field>
                <p className="text-[11px] -mt-1" style={{ color: "#64748b" }}>
                  Tip: use a short brand token like <code>make.com</code> or <code>clickup</code> so every
                  bank spelling matches. Remap once and all history + future imports follow this rule.
                </p>
                <label className="flex items-start gap-2 text-xs cursor-pointer" style={{ color: "#94a3b8" }}>
                  <input
                    type="checkbox"
                    checked={mapForm.apply_to_matching}
                    onChange={e => setMapForm(f => ({ ...f, apply_to_matching: e.target.checked }))}
                    className="mt-0.5"
                  />
                  Apply to all matching charges in history (recommended)
                </label>
              </>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setMapExpense(null)}
                className="text-xs px-3 py-1.5"
                style={{ color: "#94a3b8" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy === "map"}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                style={{ background: "rgba(245,158,11,0.25)", color: "#fbbf24" }}
              >
                {mapForm.create_rule ? "Map + save rule" : "Map once"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {showAdd && (
        <Modal title="Add charge" onClose={() => setShowAdd(false)}>
          <form onSubmit={addExpense} className="space-y-3">
            <Field label="Date">
              <input
                type="date"
                required
                value={form.occurred_on}
                onChange={e => setForm(f => ({ ...f, occurred_on: e.target.value }))}
                style={{ ...fieldStyle, width: "100%" }}
              />
            </Field>
            <Field label="Amount">
              <input
                type="number"
                step="0.01"
                required
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                style={{ ...fieldStyle, width: "100%" }}
              />
            </Field>
            <Field label="Merchant">
              <input
                required
                value={form.merchant_raw}
                onChange={e => setForm(f => ({ ...f, merchant_raw: e.target.value }))}
                style={{ ...fieldStyle, width: "100%" }}
              />
            </Field>
            <Field label="Memo">
              <input
                value={form.memo}
                onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
                style={{ ...fieldStyle, width: "100%" }}
              />
            </Field>
            <Field label="Account">
              <select
                value={form.account_id}
                onChange={e => setForm(f => ({ ...f, account_id: e.target.value }))}
                style={{ ...fieldStyle, width: "100%" }}
              >
                <option value="">—</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Bucket (optional — rules apply if Uncategorized)">
              <select
                value={form.ceo_bucket}
                onChange={e => {
                  const b = e.target.value as CeoBucket;
                  setForm(f => ({
                    ...f,
                    ceo_bucket: b,
                    fulfillment_line: b === "fulfillment" ? f.fulfillment_line : "",
                  }));
                }}
                style={{ ...fieldStyle, width: "100%" }}
              >
                {CEO_BUCKETS.map(b => (
                  <option key={b} value={b}>
                    {CEO_BUCKET_LABELS[b]}
                  </option>
                ))}
              </select>
            </Field>
            {form.ceo_bucket === "fulfillment" && (
              <Field label="COGS category">
                <select
                  required
                  value={form.fulfillment_line}
                  onChange={e =>
                    setForm(f => ({
                      ...f,
                      fulfillment_line: e.target.value as "" | FulfillmentLine,
                    }))
                  }
                  style={{ ...fieldStyle, width: "100%" }}
                >
                  <option value="">Select…</option>
                  {FULFILLMENT_LINES.map(line => (
                    <option key={line} value={line}>
                      {FULFILLMENT_LINE_LABELS[line]}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Subcategory (optional)">
              <input
                value={form.subcategory}
                onChange={e => setForm(f => ({ ...f, subcategory: e.target.value }))}
                placeholder="payroll, commissions, software…"
                style={{ ...fieldStyle, width: "100%" }}
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowAdd(false)} className="text-xs px-3 py-1.5" style={{ color: "#94a3b8" }}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy === "add"}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                style={{ background: "rgba(56,189,248,0.2)", color: "#38bdf8" }}
              >
                Save
              </button>
            </div>
          </form>
        </Modal>
      )}

      {showAccount && (
        <Modal title="Add finance account" onClose={() => setShowAccount(false)}>
          <form onSubmit={addAccount} className="space-y-3">
            <Field label="Name">
              <input
                required
                value={acctForm.name}
                onChange={e => setAcctForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Amex Business"
                style={{ ...fieldStyle, width: "100%" }}
              />
            </Field>
            <Field label="Institution">
              <input
                value={acctForm.institution}
                onChange={e => setAcctForm(f => ({ ...f, institution: e.target.value }))}
                style={{ ...fieldStyle, width: "100%" }}
              />
            </Field>
            <Field label="Type">
              <select
                value={acctForm.account_type}
                onChange={e => setAcctForm(f => ({ ...f, account_type: e.target.value as AccountType }))}
                style={{ ...fieldStyle, width: "100%" }}
              >
                {ACCOUNT_TYPES.map(t => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Entity">
              <input
                value={acctForm.entity}
                onChange={e => setAcctForm(f => ({ ...f, entity: e.target.value }))}
                style={{ ...fieldStyle, width: "100%" }}
              />
            </Field>
            <Field label="Last 4">
              <input
                value={acctForm.last4}
                maxLength={4}
                onChange={e => setAcctForm(f => ({ ...f, last4: e.target.value }))}
                style={{ ...fieldStyle, width: "100%" }}
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowAccount(false)} className="text-xs px-3 py-1.5" style={{ color: "#94a3b8" }}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy === "account"}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                style={{ background: "rgba(56,189,248,0.2)", color: "#38bdf8" }}
              >
                Save
              </button>
            </div>
          </form>
        </Modal>
      )}

      {showImport && (
        <Modal title="Import CSV" onClose={() => setShowImport(false)} wide>
          <p className="text-xs mb-3" style={{ color: "#64748b" }}>
            Supports labeled Total Costs sheets and Chase Activity exports. Unknown merchants land in
            Pending.
          </p>
          <Field label="Default account">
            <select
              value={importAccountId}
              onChange={e => setImportAccountId(e.target.value)}
              style={{ ...fieldStyle, width: "100%", marginBottom: 12 }}
            >
              <option value="">—</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <textarea
            value={csvText}
            onChange={e => setCsvText(e.target.value)}
            rows={12}
            placeholder={"date,amount,merchant,category\n2026-01-15,49.00,ClickUp,overhead"}
            style={{ ...fieldStyle, width: "100%", fontFamily: "ui-monospace, monospace", fontSize: "0.75rem" }}
          />
          <div className="flex justify-end gap-2 pt-3">
            <button type="button" onClick={() => setShowImport(false)} className="text-xs px-3 py-1.5" style={{ color: "#94a3b8" }}>
              Cancel
            </button>
            <button
              type="button"
              disabled={!csvText.trim() || busy === "preview"}
              onClick={() => runImport(true)}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg"
              style={{ background: "rgba(148,163,184,0.15)", color: "#94a3b8" }}
            >
              Preview
            </button>
            <button
              type="button"
              disabled={!csvText.trim() || busy === "import"}
              onClick={() => runImport(false)}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg"
              style={{ background: "rgba(167,139,250,0.2)", color: "#a78bfa" }}
            >
              Import
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs" style={{ color: "#64748b" }}>
      <span className="block mb-1">{label}</span>
      {children}
    </label>
  );
}

function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.65)" }}
      onClick={onClose}
    >
      <div
        className="rounded-xl p-5 max-h-[90vh] overflow-auto"
        style={{
          background: "#0a1628",
          border: "1px solid rgba(255,255,255,0.1)",
          width: "100%",
          maxWidth: wide ? 640 : 420,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold" style={{ color: "#e2e8f0" }}>
            {title}
          </h3>
          <button type="button" onClick={onClose} style={{ color: "#64748b" }} className="text-xs">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ACCOUNT_TYPES,
  CEO_BUCKETS,
  CEO_BUCKET_LABELS,
  type AccountType,
  type CeoBucket,
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
  exclude_from_pnl: boolean;
  categorized_by: string | null;
};

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

export default function ExpenseManager() {
  const [month, setMonth] = useState(currentMonth);
  const [uncategorizedOnly, setUncategorizedOnly] = useState(false);
  const [accountFilter, setAccountFilter] = useState("");
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [importAccountId, setImportAccountId] = useState("");

  const [form, setForm] = useState({
    occurred_on: new Date().toISOString().slice(0, 10),
    amount: "",
    merchant_raw: "",
    memo: "",
    account_id: "",
    ceo_bucket: "uncategorized" as CeoBucket,
    subcategory: "",
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
    const params = new URLSearchParams({ month, limit: "1000" });
    if (uncategorizedOnly) params.set("uncategorized", "1");
    if (accountFilter) params.set("account_id", accountFilter);

    const [expRes, acctRes] = await Promise.all([
      fetch(`/api/expenses?${params}`),
      fetch("/api/finance-accounts"),
    ]);
    const expData = await expRes.json();
    const acctData = await acctRes.json();
    if (!expRes.ok) setError(expData.error ?? "Failed to load expenses");
    else setExpenses(expData.expenses ?? []);
    if (acctRes.ok) setAccounts(acctData.accounts ?? []);
    setLoading(false);
  }, [month, uncategorizedOnly, accountFilter]);

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
        ? `Rolled ${month}: CAC ${money(r.marketing_spend)} · COGS ${money(r.delivery_costs)} · OpEx ${money(r.operating_expenses)}`
        : "Rollup complete",
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
      }),
    });
    const d = await res.json();
    setBusy(null);
    if (!res.ok) {
      setError(d.error ?? "Failed to add");
      return;
    }
    setShowAdd(false);
    setForm(f => ({ ...f, amount: "", merchant_raw: "", memo: "", subcategory: "" }));
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
        `Preview: ${d.would_insert} new · ${d.skipped_duplicate} dupes · ${d.skipped_invalid} invalid`,
      );
    } else {
      setMessage(`Imported ${d.inserted} charges`);
      setShowImport(false);
      setCsvText("");
      load();
    }
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-auto p-4 md:p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold" style={{ color: "#e2e8f0" }}>
            Expenses
          </h2>
          <p className="text-sm mt-0.5 max-w-2xl" style={{ color: "#64748b" }}>
            Every card/bank charge → CEO buckets (CAC, fulfillment, overhead). Roll up into Business
            KPIs. QuickBooks stays tax-only.
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
            onClick={rollupMonth}
            disabled={busy === "rollup"}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: "rgba(52,211,153,0.15)", color: "#34d399" }}
          >
            Roll up {month}
          </button>
        </div>
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

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs" style={{ color: "#64748b" }}>
          Month
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            style={{ ...fieldStyle, marginLeft: 8 }}
          />
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
        <label className="text-xs flex items-center gap-2 cursor-pointer" style={{ color: "#94a3b8" }}>
          <input
            type="checkbox"
            checked={uncategorizedOnly}
            onChange={e => setUncategorizedOnly(e.target.checked)}
          />
          Uncategorized only
        </label>
        <span className="text-xs ml-auto" style={{ color: "#64748b" }}>
          {totals.count} charges · P&amp;L {money(totals.pnl)}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {(["cac", "fulfillment", "overhead", "uncategorized"] as CeoBucket[]).map(b => (
          <div
            key={b}
            className="rounded-lg px-3 py-2"
            style={{ background: "rgba(15,32,64,0.8)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div className="text-[10px] uppercase tracking-wide" style={{ color: BUCKET_COLOR[b] }}>
              {CEO_BUCKET_LABELS[b]}
            </div>
            <div className="text-sm font-semibold mt-0.5" style={{ color: "#e2e8f0" }}>
              {money(totals.by[b] ?? 0)}
            </div>
          </div>
        ))}
      </div>

      {loading ? (
        <p className="text-sm" style={{ color: "#64748b" }}>
          Loading…
        </p>
      ) : expenses.length === 0 ? (
        <p className="text-sm" style={{ color: "#64748b" }}>
          No expenses for this filter. Add a charge, import a CSV, or seed rules then import.
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
                <th className="px-3 py-2 font-medium text-xs">Bucket</th>
                <th className="px-3 py-2 font-medium text-xs">Source</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map(e => (
                <tr key={e.id} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: "#94a3b8" }}>
                    {e.occurred_on}
                  </td>
                  <td className="px-3 py-2" style={{ color: "#e2e8f0" }}>
                    <div>{e.merchant_raw ?? "—"}</div>
                    {e.memo && (
                      <div className="text-xs mt-0.5" style={{ color: "#475569" }}>
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
                  </td>
                  <td className="px-3 py-2 text-xs" style={{ color: "#475569" }}>
                    {e.source}
                    {e.exclude_from_pnl ? " · excl" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add charge modal */}
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
                onChange={e => setForm(f => ({ ...f, ceo_bucket: e.target.value as CeoBucket }))}
                style={{ ...fieldStyle, width: "100%" }}
              >
                {CEO_BUCKETS.map(b => (
                  <option key={b} value={b}>
                    {CEO_BUCKET_LABELS[b]}
                  </option>
                ))}
              </select>
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
            Required columns: <code>date</code>, <code>amount</code>, <code>merchant</code>. Optional:{" "}
            <code>memo</code>, <code>category</code> (CAC / COGS / overhead…), <code>account</code>,{" "}
            <code>subcategory</code>.
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

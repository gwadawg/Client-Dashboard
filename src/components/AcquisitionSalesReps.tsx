"use client";

import { useEffect, useState } from "react";

type Rep = {
  id: string;
  name: string;
  role: string;
  is_active: boolean;
  sales_rep_compensation_versions?: {
    id: string;
    effective_from: string;
    effective_to: string | null;
    rates: Record<string, number>;
    note: string | null;
  }[];
};

const RATE_FIELDS = [
  { key: "demo_showed_qualified", label: "Demo showed (qualified)" },
  { key: "close_bonus", label: "Close bonus" },
  { key: "skool_close", label: "Skool close" },
] as const;

export default function AcquisitionSalesReps() {
  const [reps, setReps] = useState<Rep[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [editRates, setEditRates] = useState<Record<string, string>>({});

  async function reload() {
    const res = await fetch("/api/acquisition/sales-reps");
    const d = await res.json();
    setReps(d.reps ?? []);
    setLoading(false);
  }

  useEffect(() => {
    reload();
  }, []);

  async function createRep() {
    if (!newName.trim()) return;
    await fetch("/api/acquisition/sales-reps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create_rep", name: newName.trim(), role: "setter" }),
    });
    setNewName("");
    await reload();
  }

  async function saveRates(repId: string) {
    const rates: Record<string, number> = {};
    for (const f of RATE_FIELDS) {
      const v = editRates[`${repId}.${f.key}`];
      if (v != null && v !== "") rates[f.key] = Number(v);
    }
    await fetch("/api/acquisition/sales-reps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "add_compensation_version",
        sales_rep_id: repId,
        rates,
        note: "Updated via dashboard",
      }),
    });
    await reload();
  }

  function currentRates(rep: Rep): Record<string, number> {
    const versions = rep.sales_rep_compensation_versions ?? [];
    const current = versions.find((v) => !v.effective_to) ?? versions[0];
    return (current?.rates as Record<string, number>) ?? {};
  }

  if (loading) {
    return <p className="text-sm py-8 text-center" style={{ color: "#64748b" }}>Loading team…</p>;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <p className="text-sm" style={{ color: "#64748b" }}>
        Commission rates are versioned by effective date. Updating rates freezes the previous version for historical payout accuracy.
      </p>

      <div className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New rep name"
          className="flex-1 rounded-lg px-3 py-2 text-sm"
          style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0" }}
        />
        <button
          type="button"
          onClick={createRep}
          className="px-4 py-2 rounded-lg text-sm font-semibold"
          style={{ background: "rgba(245,158,11,0.2)", color: "#fbbf24" }}
        >
          Add rep
        </button>
      </div>

      {reps.map((rep) => {
        const rates = currentRates(rep);
        return (
          <div
            key={rep.id}
            className="rounded-xl p-4 space-y-3"
            style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold" style={{ color: "#e2e8f0" }}>{rep.name}</p>
                <p className="text-xs capitalize" style={{ color: "#64748b" }}>{rep.role}</p>
              </div>
              <span
                className="text-[10px] uppercase px-2 py-0.5 rounded-full"
                style={{ background: rep.is_active ? "rgba(52,211,153,0.15)" : "rgba(100,116,139,0.15)", color: rep.is_active ? "#34d399" : "#64748b" }}
              >
                {rep.is_active ? "Active" : "Inactive"}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {RATE_FIELDS.map((f) => (
                <label key={f.key} className="block">
                  <span className="text-[11px] uppercase tracking-wide" style={{ color: "#64748b" }}>{f.label}</span>
                  <input
                    type="number"
                    step="0.01"
                    defaultValue={rates[f.key] ?? ""}
                    onChange={(e) => setEditRates((prev) => ({ ...prev, [`${rep.id}.${f.key}`]: e.target.value }))}
                    className="mt-1 w-full rounded-lg px-3 py-2 text-sm tabular-nums"
                    style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0" }}
                  />
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={() => saveRates(rep.id)}
              className="text-sm font-medium px-3 py-1.5 rounded-lg"
              style={{ background: "rgba(255,255,255,0.06)", color: "#cbd5e1" }}
            >
              Save new rate version
            </button>
            {(rep.sales_rep_compensation_versions?.length ?? 0) > 1 && (
              <p className="text-xs" style={{ color: "#475569" }}>
                {rep.sales_rep_compensation_versions!.length} rate versions on file
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

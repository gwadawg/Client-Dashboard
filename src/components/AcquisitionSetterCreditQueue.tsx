"use client";

import { useEffect, useState, type CSSProperties } from "react";

type QueueStatus = "pending" | "credited";

type QueueRow = {
  id: string;
  lead_name: string | null;
  phone: string | null;
  booked_at: string | null;
  scheduled_at: string | null;
  setter_name: string | null;
  call_taken_by: string | null;
  booking_source: string | null;
  credited: boolean;
  credited_at: string | null;
  form_url: string | null;
};

type Props = {
  startDate: string;
  endDate: string;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AcquisitionSetterCreditQueue({ startDate, endDate }: Props) {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [status, setStatus] = useState<QueueStatus>("pending");
  const [mineOnly, setMineOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [inferredName, setInferredName] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / 50));

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(prev => {
        const next = search.trim();
        if (prev !== next) {
          setLoading(true);
          setPage(1);
        }
        return next;
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ status, page: String(page) });
    if (mineOnly) params.set("mine", "true");
    if (debouncedSearch) params.set("search", debouncedSearch);

    fetch(`/api/acquisition/setter-credit-queue?${params}`)
      .then(r => r.json().then(d => ({ ok: r.ok, data: d })))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok) {
          setError(data.error ?? "Failed to load setter queue");
          setRows([]);
          return;
        }
        setError("");
        setRows(data.rows ?? []);
        setTotal(data.total ?? 0);
        setInferredName(data.inferred_setter_name ?? null);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load setter queue");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [status, page, mineOnly, debouncedSearch, startDate, endDate]);

  const selectStyle = {
    background: "#0f2040",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#e2e8f0",
    borderRadius: "0.5rem",
    padding: "0.5rem 1rem",
    fontSize: "0.875rem",
    outline: "none",
  } as CSSProperties;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-semibold" style={{ color: "#e2e8f0" }}>
            Setter Credit Queue
          </h2>
          <p className="text-sm mt-0.5" style={{ color: "#475569" }}>
            Demo bookings waiting for booking credit. Open the form to log credit in Mr. Waiz and sync to GHL.
            {inferredName ? ` Signed in as ${inferredName}.` : ""}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap justify-end">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search lead, phone, setter…"
            className="px-3 py-2 rounded-lg text-sm outline-none min-w-[200px]"
            style={{
              background: "#0f2040",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "#e2e8f0",
            }}
          />
          <select
            value={status}
            onChange={e => {
              setStatus(e.target.value as QueueStatus);
              setPage(1);
              setLoading(true);
            }}
            style={selectStyle}
          >
            <option value="pending">Pending credit</option>
            <option value="credited">Credited</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={mineOnly}
              onChange={e => {
                setMineOnly(e.target.checked);
                setPage(1);
                setLoading(true);
              }}
            />
            My queue
          </label>
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div
        className="rounded-xl overflow-hidden"
        style={{ border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <table className="w-full text-sm">
          <thead style={{ background: "#0a1628", color: "#64748b" }}>
            <tr>
              <th className="text-left px-4 py-3 font-medium">Lead</th>
              <th className="text-left px-4 py-3 font-medium">Booked</th>
              <th className="text-left px-4 py-3 font-medium">Scheduled</th>
              <th className="text-left px-4 py-3 font-medium">Setter</th>
              <th className="text-right px-4 py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  Loading queue…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  {status === "pending"
                    ? "No demos waiting for booking credit."
                    : "No credited demos in this view."}
                </td>
              </tr>
            ) : (
              rows.map(row => (
                <tr
                  key={row.id}
                  className="border-t"
                  style={{ borderColor: "rgba(255,255,255,0.06)", background: "#060d1a" }}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-200">{row.lead_name ?? "—"}</p>
                    {row.phone && <p className="text-xs text-slate-500 mt-0.5">{row.phone}</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{formatDate(row.booked_at)}</td>
                  <td className="px-4 py-3 text-slate-400">{formatDate(row.scheduled_at)}</td>
                  <td className="px-4 py-3 text-slate-400">
                    {row.setter_name ?? row.call_taken_by ?? "—"}
                    {row.credited_at && (
                      <p className="text-xs text-emerald-500/80 mt-0.5">
                        Credited {formatDate(row.credited_at)}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {status === "pending" && row.form_url ? (
                      <a
                        href={row.form_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold"
                        style={{ background: "#f59e0b", color: "#1a1a1a" }}
                      >
                        Open form →
                      </a>
                    ) : status === "pending" ? (
                      <span className="text-xs text-slate-600">No GHL link</span>
                    ) : (
                      <span className="text-xs text-emerald-500">Done</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>
            Page {page} of {totalPages} ({total} total)
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="px-3 py-1 rounded disabled:opacity-40"
              style={{ background: "#0f2040", color: "#94a3b8" }}
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              className="px-3 py-1 rounded disabled:opacity-40"
              style={{ background: "#0f2040", color: "#94a3b8" }}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import ClientFile from "@/components/ClientFile";
import { CALL_TYPE_OPTIONS, callTypeLabel } from "@/lib/client-calls";

type Client = { id: string; name: string };

type Row = {
  id: string;
  client_id: string;
  call_type: string;
  called_at: string;
  recording_url: string | null;
  transcript: string | null;
  notes: string | null;
  attendees: string | null;
  clients: { name: string } | null;
};

type Props = { clients: Client[]; startDate: string; endDate: string };

const fieldStyle = {
  background: "#0f2040",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#e2e8f0",
  borderRadius: "0.5rem",
  padding: "0.5rem 0.75rem",
  fontSize: "0.875rem",
  outline: "none",
  width: "100%",
} as const;

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function preview(text: string | null, max = 120): string {
  if (!text) return "—";
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ClientCallsBrowser({ clients, startDate, endDate }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [clientFilter, setClientFilter] = useState("");
  const [callTypeFilter, setCallTypeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Row | null>(null);
  const [editForm, setEditForm] = useState({
    call_type: "checkin",
    called_at: "",
    recording_url: "",
    transcript: "",
    notes: "",
    attendees: "",
  });
  const [saving, setSaving] = useState(false);
  const [fileFor, setFileFor] = useState<{ id: string; name: string; scrollToCalls?: boolean } | null>(null);

  useEffect(() => {
    setPage(1);
  }, [clientFilter, callTypeFilter, search, startDate, endDate]);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (clientFilter) params.set("clientId", clientFilter);
    if (callTypeFilter) params.set("callType", callTypeFilter);
    if (search.trim()) params.set("search", search.trim());
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);

    fetch(`/api/client-calls?${params}`)
      .then(r => r.json())
      .then(d => {
        setRows(d.rows ?? []);
        setTotal(d.total ?? 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [clientFilter, callTypeFilter, search, page, startDate, endDate, reloadKey]);

  const totalPages = Math.max(1, Math.ceil(total / 50));

  function openEdit(row: Row) {
    setEditing(row);
    setEditForm({
      call_type: row.call_type,
      called_at: toDatetimeLocal(row.called_at),
      recording_url: row.recording_url ?? "",
      transcript: row.transcript ?? "",
      notes: row.notes ?? "",
      attendees: row.attendees ?? "",
    });
  }

  async function saveEdit() {
    if (!editing) return;
    setSaving(true);
    const res = await fetch(`/api/clients/${editing.client_id}/calls/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        call_type: editForm.call_type,
        called_at: new Date(editForm.called_at).toISOString(),
        recording_url: editForm.recording_url || null,
        transcript: editForm.transcript || null,
        notes: editForm.notes || null,
        attendees: editForm.attendees || null,
      }),
    });
    const d = await res.json();
    if (!res.ok) {
      alert(d.error ?? "Failed to save");
      setSaving(false);
      return;
    }
    setEditing(null);
    setSaving(false);
    setReloadKey(k => k + 1);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          style={fieldStyle}
          className="w-auto"
          value={clientFilter}
          onChange={e => setClientFilter(e.target.value)}
        >
          <option value="">All Clients</option>
          {clients.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          style={fieldStyle}
          className="w-auto"
          value={callTypeFilter}
          onChange={e => setCallTypeFilter(e.target.value)}
        >
          <option value="">All Types</option>
          {CALL_TYPE_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <input
          type="search"
          placeholder="Search transcript, notes, attendees…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...fieldStyle, maxWidth: 280 }}
        />
        <span className="text-sm ml-auto" style={{ color: "#334155" }}>
          {total.toLocaleString()} calls
        </span>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "#0a1628" }}>
              {["Date", "Client", "Type", "Recording", "Notes", "Actions"].map(h => (
                <th
                  key={h}
                  className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "#334155" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center" style={{ color: "#334155" }}>Loading…</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center" style={{ color: "#334155" }}>No client calls found</td>
              </tr>
            ) : rows.map((row, i) => (
              <tr
                key={row.id}
                style={{
                  background: i % 2 === 0 ? "#080f1e" : "#060d1a",
                  borderTop: "1px solid rgba(255,255,255,0.04)",
                }}
              >
                <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "#cbd5e1" }}>
                  {formatDateTime(row.called_at)}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "#e2e8f0" }}>
                  {row.clients?.name ?? "—"}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-semibold"
                    style={{ color: "#a78bfa", background: "rgba(167,139,250,0.12)" }}
                  >
                    {callTypeLabel(row.call_type)}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  {row.recording_url ? (
                    <a
                      href={row.recording_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold"
                      style={{ color: "#f59e0b" }}
                    >
                      Open
                    </a>
                  ) : (
                    <span style={{ color: "#334155" }}>—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 max-w-xs">
                  <span className="text-xs" style={{ color: "#94a3b8" }}>
                    {preview(row.notes || row.transcript)}
                  </span>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setFileFor({
                        id: row.client_id,
                        name: row.clients?.name ?? "Client",
                        scrollToCalls: true,
                      })}
                      className="text-xs font-semibold"
                      style={{ color: "#38bdf8" }}
                    >
                      File
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(row)}
                      className="text-xs font-semibold"
                      style={{ color: "#a78bfa" }}
                    >
                      Edit
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-3 justify-end">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-30"
            style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.10)", color: "#94a3b8" }}
          >
            ← Prev
          </button>
          <span className="text-sm" style={{ color: "#334155" }}>Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-30"
            style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.10)", color: "#94a3b8" }}
          >
            Next →
          </button>
        </div>
      )}

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(2,6,15,0.7)" }}
          onClick={() => !saving && setEditing(null)}
        >
          <div
            className="w-full max-w-lg rounded-xl p-5 space-y-3"
            style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.1)" }}
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold" style={{ color: "#e2e8f0" }}>
              Edit call — {editing.clients?.name}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>Type</span>
                <select
                  value={editForm.call_type}
                  disabled={saving}
                  onChange={e => setEditForm(f => ({ ...f, call_type: e.target.value }))}
                  className="mt-1 cursor-pointer"
                  style={fieldStyle}
                >
                  {CALL_TYPE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>Call date</span>
                <input
                  type="datetime-local"
                  value={editForm.called_at}
                  disabled={saving}
                  onChange={e => setEditForm(f => ({ ...f, called_at: e.target.value }))}
                  className="mt-1"
                  style={fieldStyle}
                />
              </label>
            </div>
            <label className="block">
              <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>Recording URL</span>
              <input
                type="url"
                value={editForm.recording_url}
                disabled={saving}
                onChange={e => setEditForm(f => ({ ...f, recording_url: e.target.value }))}
                className="mt-1"
                style={fieldStyle}
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>Attendees</span>
              <input
                value={editForm.attendees}
                disabled={saving}
                onChange={e => setEditForm(f => ({ ...f, attendees: e.target.value }))}
                className="mt-1"
                style={fieldStyle}
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>Transcript</span>
              <textarea
                value={editForm.transcript}
                disabled={saving}
                onChange={e => setEditForm(f => ({ ...f, transcript: e.target.value }))}
                rows={4}
                className="mt-1 resize-y"
                style={fieldStyle}
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#475569" }}>Notes</span>
              <textarea
                value={editForm.notes}
                disabled={saving}
                onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                rows={3}
                className="mt-1 resize-y"
                style={fieldStyle}
              />
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={saving}
                onClick={() => setEditing(null)}
                className="text-xs font-semibold px-3 py-2 rounded-lg"
                style={{ color: "#94a3b8", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={saveEdit}
                className="text-xs font-semibold px-3 py-2 rounded-lg"
                style={{ color: "#a78bfa", background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.25)" }}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {fileFor && (
        <ClientFile
          key={`${fileFor.id}-${fileFor.scrollToCalls ? "calls" : "file"}`}
          clientId={fileFor.id}
          fallbackName={fileFor.name}
          scrollToCalls={fileFor.scrollToCalls}
          onClose={() => setFileFor(null)}
        />
      )}
    </div>
  );
}

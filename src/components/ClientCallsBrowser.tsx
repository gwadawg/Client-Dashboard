"use client";

import { useEffect, useState } from "react";
import ClientCallFormFields from "@/components/ClientCallFormFields";
import ClientFile from "@/components/ClientFile";
import { CALL_TYPE_OPTIONS, callTypeLabel } from "@/lib/client-calls";
import {
  callDraftToApiBody,
  defaultCallDraft,
  rowToCallDraft,
  validateCallDraft,
  type ClientCallDraft,
} from "@/lib/client-call-draft";
import type { StoredCheckinForm } from "@/lib/checkin-form";

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
  checkin_form: StoredCheckinForm | null;
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

export default function ClientCallsBrowser({ clients, startDate, endDate }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [clientFilter, setClientFilter] = useState("");
  const [callTypeFilter, setCallTypeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

  const [modalMode, setModalMode] = useState<"add" | "edit" | null>(null);
  const [editingRow, setEditingRow] = useState<Row | null>(null);
  const [draft, setDraft] = useState<ClientCallDraft>(defaultCallDraft());
  const [saving, setSaving] = useState(false);
  const [fileFor, setFileFor] = useState<{ id: string; name: string; scrollToCalls?: boolean } | null>(null);

  useEffect(() => {
    setPage(1);
  }, [clientFilter, callTypeFilter, search, startDate, endDate]);

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

  function openAdd() {
    const presetType = CALL_TYPE_OPTIONS.some(o => o.value === callTypeFilter) ? callTypeFilter : "checkin";
    setDraft(defaultCallDraft(clientFilter, presetType));
    setEditingRow(null);
    setModalMode("add");
  }

  function openEdit(row: Row) {
    setEditingRow(row);
    setDraft(rowToCallDraft(row));
    setModalMode("edit");
  }

  function closeModal() {
    if (saving) return;
    setModalMode(null);
    setEditingRow(null);
  }

  async function saveModal() {
    const requireClient = modalMode === "add";
    const err = validateCallDraft(draft, requireClient);
    if (err) {
      alert(err);
      return;
    }

    setSaving(true);
    const body = callDraftToApiBody(draft);

    if (modalMode === "add") {
      const res = await fetch(`/api/clients/${draft.client_id}/calls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) {
        alert(d.error ?? "Failed to save call");
        setSaving(false);
        return;
      }
    } else if (modalMode === "edit" && editingRow) {
      const res = await fetch(`/api/clients/${editingRow.client_id}/calls/${editingRow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) {
        alert(d.error ?? "Failed to save call");
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    closeModal();
    setReloadKey(k => k + 1);
  }

  const isCheckin = draft.call_type === "checkin";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={openAdd}
          className="text-sm font-semibold px-4 py-2 rounded-lg"
          style={{
            color: "#38bdf8",
            background: "rgba(56,189,248,0.12)",
            border: "1px solid rgba(56,189,248,0.3)",
          }}
        >
          + Add call
        </button>
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
                <td colSpan={6} className="px-4 py-10 text-center" style={{ color: "#334155" }}>
                  No client calls found.{" "}
                  <button type="button" onClick={openAdd} className="font-semibold" style={{ color: "#38bdf8" }}>
                    Add one
                  </button>
                </td>
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

      {modalMode && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(2,6,15,0.7)" }}
          onClick={closeModal}
        >
          <div
            className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-xl p-5 space-y-4"
            style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.1)" }}
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold" style={{ color: "#e2e8f0" }}>
              {modalMode === "add"
                ? "Log new client call"
                : `Edit call — ${editingRow?.clients?.name ?? "Client"}`}
            </h3>

            <ClientCallFormFields
              draft={draft}
              onChange={setDraft}
              disabled={saving}
              clients={clients}
              showClientSelect={modalMode === "add"}
            />

            <div className="flex justify-end gap-2 pt-1 sticky bottom-0" style={{ background: "#0a1628" }}>
              <button
                type="button"
                disabled={saving}
                onClick={closeModal}
                className="text-xs font-semibold px-3 py-2 rounded-lg"
                style={{ color: "#94a3b8", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={saveModal}
                className="text-xs font-semibold px-3 py-2 rounded-lg"
                style={{
                  color: isCheckin ? "#38bdf8" : "#f59e0b",
                  background: isCheckin ? "rgba(56,189,248,0.12)" : "rgba(245,158,11,0.12)",
                  border: isCheckin ? "1px solid rgba(56,189,248,0.25)" : "1px solid rgba(245,158,11,0.25)",
                }}
              >
                {saving ? "Saving…" : modalMode === "add" ? (isCheckin ? "Save check-in" : "Save call") : "Save changes"}
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

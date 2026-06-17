"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";

type LeadOption = {
  id: string;
  lead_name: string | null;
  email: string | null;
  phone: string | null;
};

type ApptOption = {
  id: string;
  ghl_appointment_id: string | null;
  appointment_type: string;
  scheduled_at: string | null;
  call_taken_by: string | null;
  closer_form_done: boolean;
};

const inputStyle: CSSProperties = {
  background: "#0f2040",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#e2e8f0",
};

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function leadLabel(row: LeadOption) {
  const parts = [row.lead_name, row.phone, row.email].filter(Boolean);
  return parts.join(" · ") || row.id.slice(0, 8);
}

function apptLabel(row: ApptOption) {
  const type = row.appointment_type.replace(/_/g, " ");
  const when = formatWhen(row.scheduled_at);
  const closer = row.call_taken_by ? ` · ${row.call_taken_by}` : "";
  const done = row.closer_form_done ? " (done)" : "";
  return `${type} — ${when}${closer}${done}`;
}

export default function AcquisitionLogClose() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchResults, setSearchResults] = useState<LeadOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [selectedLead, setSelectedLead] = useState<LeadOption | null>(null);
  const [appointments, setAppointments] = useState<ApptOption[]>([]);
  const [appointmentKey, setAppointmentKey] = useState<string>("none");
  const [loadingContext, setLoadingContext] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (debouncedSearch.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    fetch(`/api/acquisition/log-close/search?q=${encodeURIComponent(debouncedSearch)}`)
      .then((r) => r.json())
      .then((d) => setSearchResults(d.rows ?? []))
      .catch(() => setSearchResults([]))
      .finally(() => setSearching(false));
  }, [debouncedSearch]);

  const loadLeadContext = useCallback((leadId: string) => {
    setLoadingContext(true);
    setError("");
    fetch(`/api/acquisition/log-close/context?lead_id=${encodeURIComponent(leadId)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed to load lead");
        return r.json();
      })
      .then((d) => {
        setSelectedLead({
          id: d.lead.id,
          lead_name: d.lead.lead_name,
          email: d.lead.email,
          phone: d.lead.phone,
        });
        setAppointments(d.appointments ?? []);
        setAppointmentKey("none");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load lead"))
      .finally(() => setLoadingContext(false));
  }, []);

  function pickLead(lead: LeadOption) {
    setSelectedLeadId(lead.id);
    setSelectedLead(lead);
    setSearch(leadLabel(lead));
    setSearchResults([]);
    loadLeadContext(lead.id);
  }

  async function openForm() {
    if (!selectedLeadId) return;
    setOpening(true);
    setError("");
    try {
      const q = new URLSearchParams({ lead_id: selectedLeadId });
      if (appointmentKey !== "none") {
        q.set("ghl_appointment_id", appointmentKey);
      }
      const res = await fetch(`/api/acquisition/log-close?${q}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to build form link");
      if (data.closer_form_done) {
        setError("Closer form already submitted for this appointment.");
        return;
      }
      window.open(data.form_url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to open form");
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-lg font-semibold" style={{ color: "#e2e8f0" }}>
          Log close / call review
        </h2>
        <p className="text-sm mt-1" style={{ color: "#64748b" }}>
          Search for a lead, pick the call (or no appointment), then open the Closer form with a signed link.
        </p>
      </div>

      <label className="block">
        <span className="text-xs font-medium" style={{ color: "#94a3b8" }}>
          Search lead (name, phone, or email)
        </span>
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            if (!e.target.value.trim()) {
              setSelectedLeadId("");
              setSelectedLead(null);
              setAppointments([]);
            }
          }}
          placeholder="Start typing…"
          className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none"
          style={inputStyle}
        />
      </label>

      {searching && (
        <p className="text-xs" style={{ color: "#64748b" }}>
          Searching…
        </p>
      )}

      {searchResults.length > 0 && (
        <ul
          className="rounded-lg overflow-hidden text-sm"
          style={{ border: "1px solid rgba(255,255,255,0.08)" }}
        >
          {searchResults.map((row) => (
            <li key={row.id} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
              <button
                type="button"
                onClick={() => pickLead(row)}
                className="w-full text-left px-3 py-2 hover:bg-white/5"
                style={{ color: "#cbd5e1" }}
              >
                {leadLabel(row)}
              </button>
            </li>
          ))}
        </ul>
      )}

      {loadingContext && (
        <p className="text-xs" style={{ color: "#64748b" }}>
          Loading lead…
        </p>
      )}

      {selectedLead && !loadingContext && (
        <div className="space-y-4">
          <p className="text-sm" style={{ color: "#94a3b8" }}>
            Selected: <span style={{ color: "#e2e8f0" }}>{leadLabel(selectedLead)}</span>
          </p>

          <label className="block">
            <span className="text-xs font-medium" style={{ color: "#94a3b8" }}>
              Which call?
            </span>
            <select
              value={appointmentKey}
              onChange={(e) => setAppointmentKey(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={inputStyle}
            >
              <option value="none">No appointment / closed off-calendar</option>
              {appointments.map((appt) => (
                <option
                  key={appt.id}
                  value={appt.ghl_appointment_id ?? appt.id}
                  disabled={!appt.ghl_appointment_id}
                >
                  {appt.ghl_appointment_id ? apptLabel(appt) : `${appt.appointment_type} (missing GHL id)`}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            disabled={opening}
            onClick={openForm}
            className="px-4 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"
            style={{ background: "#38bdf8", color: "#0f172a" }}
          >
            {opening ? "Opening…" : "Open Closer form"}
          </button>
        </div>
      )}

      {error && (
        <p className="text-sm" style={{ color: "#f87171" }}>
          {error}
        </p>
      )}
    </div>
  );
}

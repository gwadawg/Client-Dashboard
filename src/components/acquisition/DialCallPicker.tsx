"use client";

import { useEffect, useState } from "react";
import { formatDialOptionLabel, type DialOption } from "@/lib/acquisition-dial-linkage";

type Props = {
  contactId: string;
  token: string;
  appointmentId?: string | null;
  introAppointmentId?: string | null;
  demoAppointmentId?: string | null;
  initialDialId?: string | null;
  value: string;
  onChange: (dialId: string, dial: DialOption | null) => void;
};

const inputStyle = {
  background: "#0f2040",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#e2e8f0",
} as const;

export default function DialCallPicker({
  contactId,
  token,
  appointmentId,
  introAppointmentId,
  demoAppointmentId,
  initialDialId,
  value,
  onChange,
}: Props) {
  const [dials, setDials] = useState<DialOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!contactId || !token) return;

    const qs = new URLSearchParams({ contact_id: contactId, token });
    if (appointmentId) qs.set("appointment_id", appointmentId);
    if (introAppointmentId) qs.set("intro_appointment_id", introAppointmentId);
    if (demoAppointmentId) qs.set("demo_appointment_id", demoAppointmentId);
    if (initialDialId) qs.set("dial_id", initialDialId);

    setLoading(true);
    fetch(`/api/acquisition/forms/dial-options?${qs}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed to load calls");
        return r.json();
      })
      .then((d: { dials: DialOption[]; suggested_dial_id: string | null }) => {
        const list = d.dials ?? [];
        setDials(list);
        setLoadError(null);

        const preselect =
          (initialDialId && list.find((x) => x.id === initialDialId)?.id) ||
          d.suggested_dial_id ||
          "";
        if (preselect && !value) {
          onChange(preselect, list.find((x) => x.id === preselect) ?? null);
        }
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Failed to load calls"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onChange/value intentionally excluded on first load
  }, [contactId, token, appointmentId, introAppointmentId, demoAppointmentId, initialDialId]);

  const selected = dials.find((d) => d.id === value) ?? null;

  if (loading) {
    return <p className="text-xs text-slate-500 mt-1">Loading recent calls…</p>;
  }

  if (loadError) {
    return <p className="text-xs text-red-400 mt-1">{loadError}</p>;
  }

  if (dials.length === 0) {
    return (
      <p className="text-xs text-slate-500 mt-1">
        No recent calls found — recording may still be processing. You can submit without linking a call.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <select
        value={value}
        onChange={(e) => {
          const id = e.target.value;
          onChange(id, dials.find((d) => d.id === id) ?? null);
        }}
        className="mt-1 w-full px-3 py-2 rounded-lg text-sm outline-none"
        style={inputStyle}
      >
        <option value="">— Select call —</option>
        {dials.map((d) => (
          <option key={d.id} value={d.id}>
            {formatDialOptionLabel(d)}
          </option>
        ))}
      </select>
      {selected?.recording_url ? (
        <a
          href={selected.recording_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-amber-400 hover:text-amber-300"
        >
          Preview recording
        </a>
      ) : selected ? (
        <p className="text-xs text-slate-500">Selected call has no recording yet.</p>
      ) : (
        <p className="text-xs text-slate-500">
          Pick the call this report is for. Default is pre-selected when we can match the appointment time.
        </p>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  FONT_BODY,
  FONT_DISPLAY,
  SHADOW,
  SHADOW_SM,
  WAIZ,
  WaizWordmark,
} from "@/components/onboarding/brand";
import ClientLogActivity from "@/components/loan-log/ClientLogActivity";
import LoanLogForm from "@/components/loan-log/LoanLogForm";

type Tab = "log" | "activity";

type Props = { token: string };

function chipStyle(active: boolean): React.CSSProperties {
  return {
    border: `1px solid ${active ? WAIZ.accent : WAIZ.line}`,
    background: active ? WAIZ.tint : WAIZ.soft,
    color: active ? WAIZ.navy : WAIZ.muted,
    transition: "background 150ms, border-color 150ms, color 150ms",
  };
}

export default function ClientLogShell({ token }: Props) {
  const [tab, setTab] = useState<Tab>("log");
  const [clientName, setClientName] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/forms/loans/${encodeURIComponent(token)}`)
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setInvalid(true);
          return;
        }
        setClientName(typeof data.client_name === "string" ? data.client_name : "Your office");
      })
      .catch(() => {
        if (!cancelled) setInvalid(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleLogged = useCallback(() => {
    setActivityRefreshKey(k => k + 1);
  }, []);

  if (invalid) {
    return (
      <div className="min-h-full flex items-center justify-center px-4" style={{ fontFamily: FONT_BODY }}>
        <div className="max-w-md text-center space-y-3">
          <WaizWordmark height={28} color={WAIZ.navy} />
          <p className="text-lg font-semibold" style={{ color: WAIZ.ink }}>
            This link isn’t valid. Ask your Waiz contact for a new one.
          </p>
        </div>
      </div>
    );
  }

  if (!clientName) {
    return (
      <p className="text-center py-24 text-sm" style={{ color: WAIZ.muted, fontFamily: FONT_BODY }}>
        Loading…
      </p>
    );
  }

  return (
    <div className="min-h-full px-4 py-10" style={{ fontFamily: FONT_BODY }}>
      <div
        className="mx-auto w-full max-w-2xl rounded-2xl p-6 sm:p-8 space-y-5"
        style={{ background: WAIZ.white, boxShadow: SHADOW }}
      >
        <div className="space-y-2">
          <WaizWordmark height={24} color={WAIZ.navy} />
          <h1 className="text-2xl font-semibold leading-tight" style={{ fontFamily: FONT_DISPLAY, color: WAIZ.navy }}>
            {clientName} — Client log
          </h1>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { value: "log" as const, label: "Log" },
              { value: "activity" as const, label: "Activity" },
            ] as const
          ).map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className="rounded-xl py-3 text-sm font-semibold"
              style={chipStyle(tab === value)}
            >
              {label}
            </button>
          ))}
        </div>

        <div>
          {tab === "log" ? (
            <LoanLogForm token={token} embedded clientName={clientName} onLogged={handleLogged} />
          ) : (
            <ClientLogActivity token={token} refreshKey={activityRefreshKey} />
          )}
        </div>
      </div>
    </div>
  );
}

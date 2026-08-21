"use client";

import { useState } from "react";

export type AdsPausedFields = {
  ads_paused?: boolean | null;
  ads_paused_at?: string | null;
  ads_paused_note?: string | null;
};

type Props = {
  clientId: string;
  adsPaused: boolean;
  adsPausedNote?: string | null;
  /** Compact badge+button for headers; "row" for roster cells. */
  variant?: "header" | "row";
  disabled?: boolean;
  onUpdated?: (next: AdsPausedFields) => void;
};

async function patchAdsPaused(
  clientId: string,
  body: { ads_paused: boolean; ads_paused_note?: string | null },
): Promise<AdsPausedFields> {
  const res = await fetch(`/api/clients/${clientId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error ?? "Failed to update ads status");
  const client = d.client ?? d;
  return {
    ads_paused: !!client.ads_paused,
    ads_paused_at: client.ads_paused_at ?? null,
    ads_paused_note: client.ads_paused_note ?? null,
  };
}

export default function AdsPausedControl({
  clientId,
  adsPaused,
  adsPausedNote = null,
  variant = "header",
  disabled = false,
  onUpdated,
}: Props) {
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (disabled || busy) return;
    const pausing = !adsPaused;
    let note: string | null | undefined = undefined;
    if (pausing) {
      const entered = window.prompt(
        "Mark ads as paused? Optional note (e.g. client request, CPL kill):",
        adsPausedNote ?? "",
      );
      if (entered === null) return;
      note = entered.trim() || null;
    } else if (!window.confirm("Mark ads as on again?")) {
      return;
    }

    setBusy(true);
    try {
      const next = await patchAdsPaused(
        clientId,
        pausing
          ? { ads_paused: true, ads_paused_note: note }
          : { ads_paused: false },
      );
      onUpdated?.(next);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to update ads status");
    } finally {
      setBusy(false);
    }
  }

  const pausedStyle = {
    color: "#f59e0b",
    background: "rgba(245,158,11,0.12)",
    border: "1px solid rgba(245,158,11,0.3)",
  } as const;
  const onStyle = {
    color: "#34d399",
    background: "rgba(52,211,153,0.1)",
    border: "1px solid rgba(52,211,153,0.25)",
  } as const;
  const style = adsPaused ? pausedStyle : onStyle;
  const label = adsPaused ? "Ads paused" : "Ads on";
  const title = adsPaused
    ? adsPausedNote
      ? `Ads paused — ${adsPausedNote}. Click to turn on.`
      : "Ads paused. Click to turn on."
    : "Ads on. Click to pause.";

  if (variant === "row") {
    return (
      <button
        type="button"
        onClick={e => {
          e.stopPropagation();
          void toggle();
        }}
        disabled={disabled || busy}
        title={title}
        className="text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap"
        style={{ ...style, opacity: busy || disabled ? 0.5 : 1 }}
      >
        {busy ? "…" : adsPaused ? "Paused" : "On"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={disabled || busy}
      title={title}
      className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ ...style, opacity: busy || disabled ? 0.5 : 1 }}
    >
      {busy ? "Updating…" : label}
    </button>
  );
}

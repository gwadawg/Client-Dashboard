"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type ClientOption = { id: string; name: string; is_live?: boolean };

type Props = {
  value: string;
  onChange: (value: string) => void;
  clients: ClientOption[];
  /** Show the "Live Clients" pseudo-option (dashboard scope). */
  includeLive?: boolean;
  className?: string;
};

const ALL_VALUE = "";
const LIVE_VALUE = "__live__";

/**
 * Type-to-filter client picker. Native <select> can't search, so this is a
 * lightweight combobox: a button that opens a panel with a filter input and a
 * keyboard-navigable list. Includes the "All Clients" / "Live Clients" scopes.
 */
export default function ClientSelect({
  value,
  onChange,
  clients,
  includeLive = true,
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  type Item = { value: string; label: string; muted?: boolean };

  const baseItems = useMemo<Item[]>(() => {
    const items: Item[] = [{ value: ALL_VALUE, label: "All Clients" }];
    if (includeLive) items.push({ value: LIVE_VALUE, label: "Live Clients" });
    for (const c of clients) {
      items.push({
        value: c.id,
        label: c.is_live === false ? `${c.name} (offline)` : c.name,
        muted: c.is_live === false,
      });
    }
    return items;
  }, [clients, includeLive]);

  const filtered = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return baseItems;
    return baseItems.filter(i => i.label.toLowerCase().includes(q));
  }, [baseItems, query]);

  const selectedLabel =
    baseItems.find(i => i.value === value)?.label ?? "All Clients";

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    // Focus the filter input once the panel renders (DOM side effect only).
    if (open) queueMicrotask(() => inputRef.current?.focus());
  }, [open]);

  function commit(v: string) {
    onChange(v);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = filtered[activeIndex];
      if (item) commit(item.value);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div className={`relative ${className}`} ref={rootRef}>
      <button
        type="button"
        onClick={() => { if (!open) setActiveIndex(0); setOpen(o => !o); }}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium outline-none transition-colors min-w-[11rem]"
        style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0" }}
      >
        <span className="flex-1 text-left truncate">{selectedLabel}</span>
        <svg className="w-3.5 h-3.5 opacity-60 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1.5 rounded-xl overflow-hidden z-30 w-64"
          style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 20px 40px rgba(0,0,0,0.5)" }}
        >
          <div className="p-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <input
              ref={inputRef}
              value={query}
              onChange={e => { setQuery(e.target.value); setActiveIndex(0); }}
              onKeyDown={onKeyDown}
              placeholder="Search clients…"
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.10)", color: "#e2e8f0" }}
            />
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-4 py-3 text-xs" style={{ color: "#475569" }}>No matches</p>
            ) : (
              filtered.map((item, idx) => {
                const isSelected = item.value === value;
                const isActive = idx === activeIndex;
                return (
                  <button
                    key={item.value || "__all__"}
                    type="button"
                    onClick={() => commit(item.value)}
                    onMouseEnter={() => setActiveIndex(idx)}
                    className="block w-full text-left px-4 py-2 text-sm transition-colors truncate"
                    style={{
                      background: isActive ? "rgba(255,255,255,0.06)" : "transparent",
                      color: isSelected ? "#f59e0b" : item.muted ? "#475569" : "#94a3b8",
                      fontWeight: isSelected ? 600 : 400,
                    }}
                  >
                    {item.label}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

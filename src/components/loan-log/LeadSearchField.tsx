"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { WAIZ } from "@/components/onboarding/brand";

export type LeadHit = {
  lead_name: string;
  lead_phone: string;
  ghl_contact_id: string;
};

type Props = {
  token: string;
  inputStyle: CSSProperties;
  picked: LeadHit | null;
  onPickedChange: (hit: LeadHit | null) => void;
  cantFind: boolean;
  onCantFindChange: (value: boolean) => void;
  newName: string;
  onNewNameChange: (value: string) => void;
  newPhone: string;
  onNewPhoneChange: (value: string) => void;
};

export default function LeadSearchField({
  token,
  inputStyle,
  picked,
  onPickedChange,
  cantFind,
  onCantFindChange,
  newName,
  onNewNameChange,
  newPhone,
  onNewPhoneChange,
}: Props) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<LeadHit[]>([]);
  const [openList, setOpenList] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (cantFind || picked || query.trim().length < 2) {
      setHits([]);
      return;
    }
    const handle = window.setTimeout(() => {
      fetch(`/api/forms/loans/${encodeURIComponent(token)}/leads?q=${encodeURIComponent(query.trim())}`)
        .then(res => res.json())
        .then(data => {
          setHits(Array.isArray(data.leads) ? data.leads : []);
          setOpenList(true);
        })
        .catch(() => setHits([]));
    }, 220);
    return () => window.clearTimeout(handle);
  }, [query, token, cantFind, picked]);

  return (
    <div ref={boxRef} className="space-y-2 relative">
      <label className="text-sm font-medium" style={{ color: WAIZ.ink }}>
        Lead
      </label>
      {picked && !cantFind ? (
        <div
          className="flex items-center justify-between gap-2 rounded-xl px-3 py-3"
          style={{ background: WAIZ.tint, border: `1px solid ${WAIZ.line}` }}
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{picked.lead_name}</p>
            <p className="text-xs" style={{ color: WAIZ.muted }}>{picked.lead_phone || "No phone"}</p>
          </div>
          <button
            type="button"
            className="text-xs font-semibold"
            style={{ color: WAIZ.accent700 }}
            onClick={() => {
              onPickedChange(null);
              setQuery("");
            }}
          >
            Change
          </button>
        </div>
      ) : cantFind ? (
        <div className="space-y-2">
          <input
            style={inputStyle}
            placeholder="Lead name"
            value={newName}
            onChange={e => onNewNameChange(e.target.value)}
            required
          />
          <input
            style={inputStyle}
            placeholder="Phone"
            value={newPhone}
            onChange={e => onNewPhoneChange(e.target.value)}
            required
          />
          <button
            type="button"
            className="text-xs font-semibold"
            style={{ color: WAIZ.accent700 }}
            onClick={() => {
              onCantFindChange(false);
              onNewNameChange("");
              onNewPhoneChange("");
            }}
          >
            Search existing leads
          </button>
        </div>
      ) : (
        <>
          <input
            style={inputStyle}
            placeholder="Search by name"
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setOpenList(true);
            }}
            onFocus={() => hits.length > 0 && setOpenList(true)}
            autoComplete="off"
          />
          {openList && hits.length > 0 && (
            <ul
              className="absolute z-10 left-0 right-0 mt-1 rounded-xl overflow-hidden max-h-56 overflow-y-auto"
              style={{
                background: WAIZ.white,
                border: `1px solid ${WAIZ.line}`,
                boxShadow: "0 8px 24px rgba(6,26,74,.12)",
              }}
            >
              {hits.map(hit => (
                <li key={`${hit.ghl_contact_id}-${hit.lead_phone}`}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2.5 hover:bg-slate-50"
                    onClick={() => {
                      onPickedChange(hit);
                      setOpenList(false);
                      setQuery("");
                    }}
                  >
                    <span className="block text-sm font-medium">{hit.lead_name}</span>
                    <span className="block text-xs" style={{ color: WAIZ.muted }}>
                      {hit.lead_phone || "No phone"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="text-xs font-semibold"
            style={{ color: WAIZ.accent700 }}
            onClick={() => {
              onCantFindChange(true);
              onPickedChange(null);
              setOpenList(false);
            }}
          >
            Can’t find this lead
          </button>
        </>
      )}
    </div>
  );
}

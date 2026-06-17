"use client";

import { useEffect, useState } from "react";

type ChecklistItem = {
  id: string;
  label: string;
};

type Props = {
  slug: string;
  items: ChecklistItem[];
};

function storageKey(slug: string) {
  return `library-checklist:${slug}`;
}

export default function SessionChecklist({ slug, items }: Props) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey(slug));
      if (raw) setChecked(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, [slug]);

  function toggle(id: string) {
    setChecked((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        sessionStorage.setItem(storageKey(slug), JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const done = items.filter((i) => checked[i.id]).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;

  return (
    <div
      className="mb-8 rounded-2xl p-5"
      style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)" }}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#f59e0b" }}>
          Call checklist
        </h3>
        <span className="text-xs font-medium" style={{ color: "#94a3b8" }}>
          {done}/{items.length} · session only
        </span>
      </div>
      <div className="mb-4 h-1.5 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${pct}%`, background: "#f59e0b" }}
        />
      </div>
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.id}>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={!!checked[item.id]}
                onChange={() => toggle(item.id)}
                className="mt-1 h-4 w-4 shrink-0 rounded accent-amber-500"
              />
              <span
                className="text-sm leading-relaxed"
                style={{
                  color: checked[item.id] ? "#64748b" : "#e2e8f0",
                  textDecoration: checked[item.id] ? "line-through" : "none",
                }}
              >
                {item.label}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Interactive task-list checkbox used inside markdown body. */
export function SessionTaskCheckbox({
  slug,
  itemId,
  label,
  defaultChecked,
}: {
  slug: string;
  itemId: string;
  label: React.ReactNode;
  defaultChecked?: boolean;
}) {
  const [checked, setChecked] = useState(defaultChecked ?? false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey(slug));
      if (raw) {
        const map = JSON.parse(raw) as Record<string, boolean>;
        if (itemId in map) setChecked(map[itemId]);
      }
    } catch {
      /* ignore */
    }
  }, [slug, itemId]);

  function toggle() {
    setChecked((prev) => {
      const next = !prev;
      try {
        const raw = sessionStorage.getItem(storageKey(slug));
        const map = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
        map[itemId] = next;
        sessionStorage.setItem(storageKey(slug), JSON.stringify(map));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <label className="flex cursor-pointer items-start gap-3 my-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={toggle}
        className="mt-1 h-4 w-4 shrink-0 rounded accent-amber-500"
      />
      <span
        className="text-sm leading-relaxed"
        style={{
          color: checked ? "#64748b" : "#cbd5e1",
          textDecoration: checked ? "line-through" : "none",
        }}
      >
        {label}
      </span>
    </label>
  );
}

export const INTRO_CALL_CHECKLIST: ChecklistItem[] = [
  { id: "frame", label: "1. Frame — not a sales call; fit + no wasted time" },
  { id: "qualify", label: "2. Qualifying questions — FUN pass or route out" },
  { id: "sold-demo", label: "3. Sold demo — ICP track picked, they agreed" },
  { id: "tie-down-appt", label: "4. Tie down appointment + confirm info in GHL" },
  { id: "pre-call", label: "5. Commit to watching pre-call material" },
];

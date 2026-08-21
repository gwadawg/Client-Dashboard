"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type CardAction = {
  id: string;
  label: string;
  onClick: () => void;
  href?: string;
  tone?: "default" | "danger" | "accent" | "muted";
};

type Props = {
  actions: CardAction[];
};

const TONE: Record<NonNullable<CardAction["tone"]>, string> = {
  default: "#e2e8f0",
  danger: "#f87171",
  accent: "#fbbf24",
  muted: "#94a3b8",
};

export default function CardActionsMenu({ actions }: Props) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function place() {
      const el = btnRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const width = 180;
      const left = Math.min(window.innerWidth - width - 8, Math.max(8, r.right - width));
      setPos({ top: r.bottom + 4, left });
    }
    place();
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (actions.length === 0) return null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className="text-xs px-2 py-0.5 rounded"
        style={{ color: "#94a3b8", background: open ? "rgba(255,255,255,0.06)" : "transparent" }}
        title="More actions"
      >
        ⋯
      </button>
      {open && pos && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              role="menu"
              className="fixed z-[80] min-w-[180px] rounded-lg py-1 shadow-lg"
              style={{
                top: pos.top,
                left: pos.left,
                background: "#0f1c2e",
                border: "1px solid rgba(255,255,255,0.12)",
              }}
            >
              {actions.map((a) => {
                const color = TONE[a.tone ?? "default"];
                const className = "block w-full text-left px-3 py-2 text-xs hover:bg-white/5";
                if (a.href) {
                  return (
                    <a
                      key={a.id}
                      role="menuitem"
                      href={a.href}
                      target="_blank"
                      rel="noreferrer"
                      className={className}
                      style={{ color }}
                      onClick={() => setOpen(false)}
                    >
                      {a.label}
                    </a>
                  );
                }
                return (
                  <button
                    key={a.id}
                    type="button"
                    role="menuitem"
                    className={className}
                    style={{ color }}
                    onClick={() => {
                      setOpen(false);
                      a.onClick();
                    }}
                  >
                    {a.label}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import type { LibraryHeading, LibraryNavPill } from "@/lib/library-manifest";

type Props = {
  stageNav: LibraryHeading[];
  openingPills: LibraryNavPill[];
  icpPills: LibraryNavPill[];
  onJump: (id: string) => void;
  activeId: string | null;
  /** Distance from viewport top when pinned (below doc header). */
  stickyTop?: string;
};

function NavButton({
  label,
  id,
  active,
  onJump,
}: {
  label: string;
  id: string;
  active: boolean;
  onJump: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onJump(id)}
      className="w-full text-left rounded-lg px-3 py-2 text-xs font-medium transition-colors"
      style={{
        background: active ? "rgba(245,158,11,0.14)" : "transparent",
        color: active ? "#f59e0b" : "#94a3b8",
        border: active ? "1px solid rgba(245,158,11,0.3)" : "1px solid transparent",
      }}
    >
      {label}
    </button>
  );
}

function PillRow({
  label,
  pills,
  onJump,
}: {
  label: string;
  pills: LibraryNavPill[];
  onJump: (id: string) => void;
}) {
  if (!pills.length) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-[9px] font-bold uppercase tracking-widest px-1" style={{ color: "#475569" }}>
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {pills.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onJump(p.id)}
            className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{
              background: "rgba(255,255,255,0.05)",
              color: "#cbd5e1",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ScriptStageNav({
  stageNav,
  openingPills,
  icpPills,
  onJump,
  activeId,
  stickyTop = "5.5rem",
}: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const content = (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-widest px-1" style={{ color: "#475569" }}>
          {stageNav.some((h) => /^stage\s+\d/i.test(h.title)) ? "Stages" : "Sections"}
        </p>
        {stageNav.length ? (
          stageNav.map((h) => (
            <NavButton
              key={h.id}
              id={h.id}
              label={h.title}
              active={activeId === h.id}
              onJump={(id) => {
                onJump(id);
                setMobileOpen(false);
              }}
            />
          ))
        ) : (
          <p className="text-xs px-1" style={{ color: "#64748b" }}>
            No sections yet
          </p>
        )}
      </div>
      <PillRow label="Openings" pills={openingPills} onJump={onJump} />
      <PillRow label="ICP tracks" pills={icpPills} onJump={onJump} />
    </div>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        type="button"
        className="lg:hidden fixed bottom-5 right-5 z-40 rounded-full px-4 py-3 text-sm font-semibold shadow-lg"
        style={{ background: "#f59e0b", color: "#1a1206" }}
        onClick={() => setMobileOpen(true)}
      >
        Sections
      </button>

      {/* Mobile sheet */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          />
          <div
            className="relative max-h-[70vh] overflow-y-auto rounded-t-2xl p-5"
            style={{ background: "#0a1628", borderTop: "1px solid rgba(255,255,255,0.1)" }}
          >
            {content}
          </div>
        </div>
      )}

      {/* Desktop sidebar — sticky below doc header, scrollable when long */}
      <aside
        className="hidden lg:block sticky self-start overflow-y-auto overscroll-contain pr-1"
        style={{
          top: stickyTop,
          maxHeight: `calc(100vh - ${stickyTop} - 1rem)`,
        }}
      >
        {content}
      </aside>
    </>
  );
}

export function useScrollSpy(sectionIds: string[]) {
  const [activeId, setActiveId] = useState<string | null>(sectionIds[0] ?? null);

  useEffect(() => {
    if (!sectionIds.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]?.target.id) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -60% 0px", threshold: [0, 0.25, 0.5] },
    );

    for (const id of sectionIds) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [sectionIds]);

  return activeId;
}

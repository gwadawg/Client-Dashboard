"use client";

import Link from "next/link";
import {
  artifactMeta,
  getSetterPlaybooks,
  libraryHref,
  statusMeta,
} from "@/lib/library-manifest";

const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

export default function SetterPlaybooksSection() {
  const playbooks = getSetterPlaybooks();
  const featured = playbooks.find((d) => d.featured) ?? playbooks[0];
  const companions = playbooks.filter((d) => d.slug !== featured?.slug);

  if (!featured) return null;

  const art = artifactMeta(featured.artifact_type);
  const st = statusMeta(featured.status);

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#cbd5e1" }}>
            Setter Playbooks
          </h3>
          <p className="text-xs mt-1" style={{ color: "#64748b" }}>
            Native scripts and SOPs — interactive, copy-ready, cross-linked.
          </p>
        </div>
      </div>

      <Link
        href={libraryHref(featured.slug)}
        className="res-rise block rounded-[1.4rem] p-1.5"
        style={{
          background: "rgba(52,211,153,0.06)",
          border: "1px solid rgba(52,211,153,0.2)",
          animation: `res-rise 600ms ${EASE} both`,
        }}
      >
        <div
          className="rounded-[1.05rem] p-6"
          style={{ background: "#0a1628", boxShadow: "inset 0 1px 1px rgba(255,255,255,0.05)" }}
        >
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span
              className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
              style={{ background: art.tint, color: art.color }}
            >
              {art.label}
            </span>
            {featured.script_version && (
              <span
                className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
                style={{ background: "rgba(245,158,11,0.12)", color: "#f59e0b" }}
              >
                {featured.script_version}
              </span>
            )}
            <span
              className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
              style={{ background: st.tint, color: st.color }}
            >
              {st.label}
            </span>
            <span
              className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
              style={{ background: "rgba(255,255,255,0.05)", color: "#64748b" }}
            >
              {featured.owner}
            </span>
          </div>
          <h4 className="text-xl font-semibold leading-snug" style={{ color: "#f1f5f9" }}>
            {featured.title}
          </h4>
          <p className="mt-2 text-sm leading-relaxed max-w-2xl" style={{ color: "#64748b" }}>
            {featured.description}
          </p>
          <span className="mt-5 inline-block text-sm font-semibold" style={{ color: "#34d399" }}>
            Open script →
          </span>
        </div>
      </Link>

      {companions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {companions.map((doc) => {
            const cArt = artifactMeta(doc.artifact_type);
            return (
              <Link
                key={doc.slug}
                href={libraryHref(doc.slug)}
                className="rounded-full px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/[0.06]"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  color: cArt.color,
                  border: `1px solid ${cArt.color}33`,
                }}
              >
                {doc.title}
                {doc.status === "draft" ? " (draft)" : ""}
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

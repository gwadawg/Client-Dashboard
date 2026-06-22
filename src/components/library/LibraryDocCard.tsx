"use client";

import Link from "next/link";
import { useState } from "react";
import { artifactMeta, statusMeta } from "@/lib/library-manifest";
import { ownerLabel, type PlaybookItem } from "@/lib/resource-index";

const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

type Props = {
  item: PlaybookItem;
  index?: number;
  featured?: boolean;
  canManage?: boolean;
  deleting?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
};

export default function LibraryDocCard({
  item,
  index = 0,
  featured = false,
  canManage = false,
  deleting = false,
  onEdit,
  onDelete,
}: Props) {
  const [hover, setHover] = useState(false);
  const art = artifactMeta(item.artifact_type);
  const st = statusMeta(item.status);
  const isDb = !!item.dbSlug;

  return (
    <div
      className="res-rise relative h-full rounded-[1.4rem] p-1.5"
      style={{
        background: featured ? "rgba(52,211,153,0.06)" : "rgba(255,255,255,0.03)",
        border: `1px solid ${featured ? "rgba(52,211,153,0.22)" : hover ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)"}`,
        transform: hover ? "translateY(-3px)" : "translateY(0)",
        transition: `transform 400ms ${EASE}, border-color 400ms ${EASE}`,
        animation: `res-rise 600ms ${EASE} both`,
        animationDelay: `${Math.min(index * 40, 320)}ms`,
        opacity: deleting ? 0.5 : 1,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {canManage && isDb && (
        <div
          className="absolute top-3 right-3 z-10 flex items-center gap-1"
          style={{ opacity: hover ? 1 : 0.4, transition: `opacity 300ms ${EASE}` }}
        >
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); onEdit?.(); }}
            title="Edit"
            className="flex items-center justify-center w-7 h-7 rounded-lg"
            style={{ color: "#64748b", background: "rgba(255,255,255,0.08)" }}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); onDelete?.(); }}
            title="Delete"
            disabled={deleting}
            className="flex items-center justify-center w-7 h-7 rounded-lg"
            style={{ color: "#f87171", background: "rgba(248,113,113,0.08)" }}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      )}

      <Link
        href={item.href}
        className="flex h-full flex-col rounded-[1.05rem] p-5"
        style={{ background: "#0a1628", boxShadow: "inset 0 1px 1px rgba(255,255,255,0.05)" }}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
            style={{ background: art.tint, color: art.color }}
          >
            {art.label}
          </span>
          {item.script_version && (
            <span
              className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
              style={{ background: "rgba(245,158,11,0.12)", color: "#f59e0b" }}
            >
              {item.script_version}
            </span>
          )}
          {item.status === "draft" && (
            <span
              className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
              style={{ background: st.tint, color: st.color }}
            >
              Draft
            </span>
          )}
          <span
            className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
            style={{ background: "rgba(255,255,255,0.05)", color: "#64748b" }}
          >
            {ownerLabel(item.owner)}
          </span>
        </div>

        <h3 className="mt-4 text-base font-semibold leading-snug pr-12" style={{ color: "#e2e8f0" }}>
          {item.title}
        </h3>
        {item.description && (
          <p className="mt-1.5 text-sm leading-relaxed line-clamp-3" style={{ color: "#64748b" }}>
            {item.description}
          </p>
        )}

        <span className="mt-auto pt-4 text-sm font-semibold" style={{ color: featured ? "#34d399" : "#f59e0b" }}>
          Open →
        </span>
      </Link>
    </div>
  );
}

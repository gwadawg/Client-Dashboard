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
};

export default function LibraryDocCard({ item, index = 0, featured = false }: Props) {
  const [hover, setHover] = useState(false);
  const art = artifactMeta(item.artifact_type);
  const st = statusMeta(item.status);

  return (
    <Link
      href={item.href}
      className="res-rise block h-full rounded-[1.4rem] p-1.5"
      style={{
        background: featured ? "rgba(52,211,153,0.06)" : "rgba(255,255,255,0.03)",
        border: `1px solid ${featured ? "rgba(52,211,153,0.22)" : hover ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)"}`,
        transform: hover ? "translateY(-3px)" : "translateY(0)",
        transition: `transform 400ms ${EASE}, border-color 400ms ${EASE}`,
        animation: `res-rise 600ms ${EASE} both`,
        animationDelay: `${Math.min(index * 40, 320)}ms`,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
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

        <h3 className="mt-4 text-base font-semibold leading-snug" style={{ color: "#e2e8f0" }}>
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
      </div>
    </Link>
  );
}

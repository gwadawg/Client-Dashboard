"use client";

import { useState } from "react";
import { splitPlaceholders } from "@/lib/library-markdown";

type Props = {
  children: React.ReactNode;
};

function PlaceholderText({ text }: { text: string }) {
  const parts = splitPlaceholders(text);
  return (
    <>
      {parts.map((p, i) =>
        p.type === "placeholder" ? (
          <span
            key={i}
            className="mx-0.5 rounded px-1.5 py-0.5 text-[0.9em] font-semibold"
            style={{ background: "rgba(245,158,11,0.18)", color: "#fbbf24" }}
          >
            {p.value}
          </span>
        ) : (
          <span key={i}>{p.value}</span>
        ),
      )}
    </>
  );
}

export default function DialogueBlock({ children }: Props) {
  const [copied, setCopied] = useState(false);
  const text =
    typeof children === "string"
      ? children
      : Array.isArray(children)
        ? children.map((c) => (typeof c === "string" ? c : "")).join("")
        : "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(text.replace(/^>\s?/gm, "").trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      className="group relative my-4 rounded-xl pl-4 pr-12 py-4"
      style={{
        background: "#0f2040",
        borderLeft: "3px solid #f59e0b",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
      }}
    >
      <blockquote className="m-0 border-0 p-0 text-[15px] leading-relaxed not-italic" style={{ color: "#e8dcc8" }}>
        <PlaceholderText text={text} />
      </blockquote>
      <button
        type="button"
        onClick={copy}
        className="absolute right-3 top-3 rounded-lg px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide opacity-70 group-hover:opacity-100 transition-opacity"
        style={{
          background: copied ? "rgba(52,211,153,0.2)" : "rgba(255,255,255,0.08)",
          color: copied ? "#34d399" : "#94a3b8",
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

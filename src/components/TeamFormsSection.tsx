"use client";

import Link from "next/link";
import { INTERNAL_FORMS } from "@/lib/internal-forms";

const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

export default function TeamFormsSection() {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#cbd5e1" }}>
            Team Forms
          </h3>
          <p className="text-xs mt-1" style={{ color: "#64748b" }}>
            Built-in Mr. Waiz forms — bookmark or share with your team.
          </p>
        </div>
        <Link
          href="/forms"
          className="text-xs font-semibold"
          style={{ color: "#38bdf8" }}
        >
          All forms →
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {INTERNAL_FORMS.map((form, index) => (
          <Link
            key={form.slug}
            href={form.href}
            className="res-rise rounded-[1.4rem] p-1.5 block h-full"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              animation: `res-rise 600ms ${EASE} both`,
              animationDelay: `${Math.min(index * 45, 180)}ms`,
            }}
          >
            <div
              className="flex h-full flex-col rounded-[1.05rem] p-5"
              style={{ background: "#0a1628", boxShadow: "inset 0 1px 1px rgba(255,255,255,0.05)" }}
            >
              <span
                className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider w-fit"
                style={{ background: "rgba(96,165,250,0.12)", color: "#60a5fa" }}
              >
                Form
              </span>
              <h4 className="mt-4 text-base font-semibold leading-snug" style={{ color: "#e2e8f0" }}>
                {form.title}
              </h4>
              <p className="mt-1.5 text-sm leading-relaxed line-clamp-2" style={{ color: "#64748b" }}>
                {form.description}
              </p>
              <span className="mt-auto pt-4 text-sm font-semibold" style={{ color: "#f59e0b" }}>
                Open form →
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

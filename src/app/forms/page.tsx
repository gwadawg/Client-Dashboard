"use client";

import Link from "next/link";
import { INTERNAL_FORMS } from "@/lib/internal-forms";

export default function FormsHubPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-100">Team Forms</h1>
        <p className="text-sm mt-2 text-slate-500">
          Bookmark these links or find them under Resources → Team Forms. New internal forms will appear here as they are added.
        </p>
      </div>

      <div className="space-y-3">
        {INTERNAL_FORMS.map(form => (
          <Link
            key={form.slug}
            href={form.href}
            className="block rounded-xl p-5 transition-colors hover:bg-white/[0.03]"
            style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-base font-semibold text-slate-200">{form.title}</p>
                <p className="text-xs mt-0.5 text-amber-500/90">{form.audience}</p>
                <p className="text-sm mt-2 text-slate-500 leading-relaxed">{form.description}</p>
                {form.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {form.tags.map(tag => (
                      <span
                        key={tag}
                        className="rounded-md px-2 py-0.5 text-[11px] font-medium"
                        style={{ background: "rgba(255,255,255,0.04)", color: "#64748b" }}
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <span className="text-sm font-semibold text-sky-400 shrink-0">Open →</span>
            </div>
            <p className="mt-3 text-xs font-mono text-slate-600 truncate">{form.href}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

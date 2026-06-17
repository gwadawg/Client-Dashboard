"use client";

import Link from "next/link";
import {
  artifactMeta,
  libraryHref,
  statusMeta,
  type LibraryDocMeta,
} from "@/lib/library-manifest";

type Props = {
  docs: LibraryDocMeta[];
  currentSlug: string;
};

export default function RelatedDocsPanel({ docs, currentSlug }: Props) {
  const filtered = docs.filter((d) => d.slug !== currentSlug);
  if (!filtered.length) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#475569" }}>
        Related
      </h3>
      <div className="space-y-2">
        {filtered.map((doc) => {
          const art = artifactMeta(doc.artifact_type);
          const st = statusMeta(doc.status);
          return (
            <Link
              key={doc.slug}
              href={libraryHref(doc.slug)}
              className="block rounded-xl p-3 transition-colors hover:bg-white/[0.04]"
              style={{ border: "1px solid rgba(255,255,255,0.06)", background: "#0a1628" }}
            >
              <div className="flex flex-wrap items-center gap-1.5 mb-1">
                <span
                  className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                  style={{ background: art.tint, color: art.color }}
                >
                  {art.label}
                </span>
                {doc.status === "draft" && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                    style={{ background: st.tint, color: st.color }}
                  >
                    Draft
                  </span>
                )}
              </div>
              <p className="text-sm font-medium leading-snug" style={{ color: "#e2e8f0" }}>
                {doc.title}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

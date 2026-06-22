"use client";

import { useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import DialogueBlock from "@/components/library/DialogueBlock";
import CalloutBlock from "@/components/library/CalloutBlock";
import SessionChecklist, {
  INTRO_CALL_CHECKLIST,
  SessionTaskCheckbox,
} from "@/components/library/SessionChecklist";
import RelatedDocsPanel from "@/components/library/RelatedDocsPanel";
import ScriptStageNav, { useScrollSpy } from "@/components/library/ScriptStageNav";
import { slugifyHeading } from "@/lib/library-markdown";
import {
  artifactMeta,
  getRelatedDocs,
  libraryHref,
  statusMeta,
  type LibraryDocMeta,
} from "@/lib/library-manifest";

type Props = {
  meta: LibraryDocMeta;
  body: string;
};

let taskCounter = 0;

function getTextFromChildren(children: React.ReactNode): string {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) return children.map(getTextFromChildren).join("");
  if (children && typeof children === "object" && "props" in children) {
    const props = (children as { props?: { children?: React.ReactNode } }).props;
    return getTextFromChildren(props?.children ?? "");
  }
  return "";
}

export default function LibraryDocViewer({ meta, body }: Props) {
  const contentRef = useRef<HTMLDivElement>(null);
  const relatedFromManifest = getRelatedDocs(meta.slug);
  const related =
    relatedFromManifest.length > 0
      ? relatedFromManifest
      : meta.related_docs.map((r) => ({
          slug: r.slug,
          title: r.label,
          description: "",
          domain: meta.domain,
          owner: meta.owner,
          status: "active" as const,
          artifact_type: "reference" as const,
          last_updated: null,
          review_cycle: null,
          script_version: null,
          path: `db://${r.slug}`,
          headings: [],
          stage_nav: [],
          opening_pills: [],
          icp_pills: [],
          related_docs: [],
        }));
  const art = artifactMeta(meta.artifact_type);
  const st = statusMeta(meta.status);

  const sectionIds = useMemo(
    () =>
      meta.stage_nav.length
        ? meta.stage_nav.map((h) => h.id)
        : meta.headings.filter((h) => h.level === 2).map((h) => h.id),
    [meta.headings, meta.stage_nav],
  );
  const activeId = useScrollSpy(sectionIds);

  const jumpTo = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const showIntroChecklist = meta.slug === "intro-call-script";

  const markdownComponents = useMemo(() => {
    taskCounter = 0;
    return {
      h1: ({ children }: { children?: React.ReactNode }) => (
        <h1 className="text-2xl font-semibold tracking-tight mb-6" style={{ color: "#f1f5f9" }}>
          {children}
        </h1>
      ),
      h2: ({ children }: { children?: React.ReactNode }) => {
        const text = getTextFromChildren(children);
        const id = slugifyHeading(text);
        return (
          <h2
            id={id}
            className="scroll-mt-24 text-lg font-semibold mt-10 mb-4 pt-2 border-t"
            style={{ color: "#e2e8f0", borderColor: "rgba(255,255,255,0.06)" }}
          >
            {children}
          </h2>
        );
      },
      h3: ({ children }: { children?: React.ReactNode }) => {
        const text = getTextFromChildren(children);
        const id = slugifyHeading(text);
        return (
          <h3 id={id} className="scroll-mt-24 text-base font-semibold mt-6 mb-3" style={{ color: "#cbd5e1" }}>
            {children}
          </h3>
        );
      },
      h4: ({ children }: { children?: React.ReactNode }) => {
        const text = getTextFromChildren(children);
        const id = slugifyHeading(text);
        return (
          <h4 id={id} className="scroll-mt-24 text-sm font-semibold mt-4 mb-2" style={{ color: "#94a3b8" }}>
            {children}
          </h4>
        );
      },
      p: ({ children }: { children?: React.ReactNode }) => {
        const text = getTextFromChildren(children).trim();
        if (text.startsWith("📋")) {
          return <CalloutBlock type="operator">{text.replace(/^📋\s*/, "")}</CalloutBlock>;
        }
        if (text.startsWith("🔴")) {
          return <CalloutBlock type="critical">{text.replace(/^🔴\s*/, "")}</CalloutBlock>;
        }
        return (
          <p className="my-3 text-[15px] leading-relaxed" style={{ color: "#94a3b8" }}>
            {children}
          </p>
        );
      },
      blockquote: ({ children }: { children?: React.ReactNode }) => (
        <DialogueBlock>{getTextFromChildren(children)}</DialogueBlock>
      ),
      a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
        if (href?.startsWith("/library/")) {
          return (
            <Link href={href} className="font-medium underline underline-offset-2" style={{ color: "#38bdf8" }}>
              {children}
            </Link>
          );
        }
        if (href?.startsWith("#")) {
          return (
            <button
              type="button"
              onClick={() => jumpTo(href.slice(1))}
              className="font-medium underline underline-offset-2"
              style={{ color: "#38bdf8" }}
            >
              {children}
            </button>
          );
        }
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline underline-offset-2"
            style={{ color: "#64748b" }}
          >
            {children}
          </a>
        );
      },
      ul: ({ children }: { children?: React.ReactNode }) => (
        <ul className="my-3 list-disc space-y-1 pl-5 text-sm" style={{ color: "#94a3b8" }}>
          {children}
        </ul>
      ),
      ol: ({ children }: { children?: React.ReactNode }) => (
        <ol className="my-3 list-decimal space-y-1 pl-5 text-sm" style={{ color: "#94a3b8" }}>
          {children}
        </ol>
      ),
      li: ({ children }: { children?: React.ReactNode }) => {
        const text = getTextFromChildren(children);
        const taskMatch = text.match(/^\[([ xX])\]\s*(.+)$/);
        if (taskMatch) {
          const id = `task-${meta.slug}-${++taskCounter}`;
          return (
            <li className="list-none -ml-5">
              <SessionTaskCheckbox
                slug={meta.slug}
                itemId={id}
                label={taskMatch[2]}
                defaultChecked={taskMatch[1].toLowerCase() === "x"}
              />
            </li>
          );
        }
        return <li className="leading-relaxed">{children}</li>;
      },
      table: ({ children }: { children?: React.ReactNode }) => (
        <div className="my-4 overflow-x-auto rounded-xl" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
          <table className="w-full text-sm">{children}</table>
        </div>
      ),
      thead: ({ children }: { children?: React.ReactNode }) => (
        <thead style={{ background: "rgba(255,255,255,0.04)" }}>{children}</thead>
      ),
      th: ({ children }: { children?: React.ReactNode }) => (
        <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "#94a3b8" }}>
          {children}
        </th>
      ),
      td: ({ children }: { children?: React.ReactNode }) => (
        <td className="px-4 py-2.5 align-top" style={{ color: "#cbd5e1", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          {children}
        </td>
      ),
      hr: () => <hr className="my-8 border-0 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />,
      strong: ({ children }: { children?: React.ReactNode }) => (
        <strong className="font-semibold" style={{ color: "#e2e8f0" }}>
          {children}
        </strong>
      ),
    };
  }, [meta.slug, jumpTo]);

  return (
    <div className="min-h-screen" style={{ background: "#060d18" }}>
      {/* Header */}
      <header
        className="sticky top-0 z-30 border-b backdrop-blur-md"
        style={{ background: "rgba(6,13,24,0.92)", borderColor: "rgba(255,255,255,0.06)" }}
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/dashboard?view=resources&lib=playbooks"
            className="text-sm font-medium"
            style={{ color: "#64748b" }}
          >
            ← Library
          </Link>
          <div className="flex flex-1 flex-wrap items-center gap-2 min-w-0">
            <h1 className="truncate text-base font-semibold sm:text-lg" style={{ color: "#f1f5f9" }}>
              {meta.title}
            </h1>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
              style={{ background: art.tint, color: art.color }}
            >
              {art.label}
            </span>
            {meta.script_version && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                style={{ background: "rgba(245,158,11,0.12)", color: "#f59e0b" }}
              >
                {meta.script_version}
              </span>
            )}
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
              style={{ background: st.tint, color: st.color }}
            >
              {st.label}
            </span>
          </div>
        </div>
      </header>

      {meta.status === "draft" && (
        <div
          className="px-4 py-2.5 text-center text-sm font-medium"
          style={{ background: "rgba(251,191,36,0.12)", color: "#fbbf24", borderBottom: "1px solid rgba(251,191,36,0.25)" }}
        >
          Draft — review before live use
        </div>
      )}

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 lg:grid-cols-[220px_1fr_200px] sm:px-6 lg:items-start">
        {/* Left: stage nav */}
        <ScriptStageNav
          stageNav={meta.stage_nav}
          openingPills={meta.opening_pills}
          icpPills={meta.icp_pills}
          onJump={jumpTo}
          activeId={activeId}
          stickyTop={meta.status === "draft" ? "7.25rem" : "5.5rem"}
        />

        {/* Main content */}
        <main ref={contentRef} className="min-w-0 max-w-3xl">
          {showIntroChecklist && <SessionChecklist slug={meta.slug} items={INTRO_CALL_CHECKLIST} />}

          <details className="mb-6 rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <summary className="cursor-pointer font-medium" style={{ color: "#94a3b8" }}>
              Placeholder legend
            </summary>
            <div className="mt-2 flex flex-wrap gap-2 text-xs" style={{ color: "#64748b" }}>
              {["[NAME]", "[SETTER NAME]", "[CLOSER NAME]", "[LOW]", "[HIGH]"].map((p) => (
                <span
                  key={p}
                  className="rounded px-1.5 py-0.5 font-semibold"
                  style={{ background: "rgba(245,158,11,0.18)", color: "#fbbf24" }}
                >
                  {p}
                </span>
              ))}
            </div>
          </details>

          <article className="library-prose">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {body}
            </ReactMarkdown>
          </article>
        </main>

        {/* Right: related docs (desktop) */}
        <aside
          className="hidden lg:block sticky self-start overflow-y-auto overscroll-contain"
          style={{
            top: meta.status === "draft" ? "7.25rem" : "5.5rem",
            maxHeight: `calc(100vh - ${meta.status === "draft" ? "7.25rem" : "5.5rem"} - 1rem)`,
          }}
        >
          <RelatedDocsPanel docs={related} currentSlug={meta.slug} />
        </aside>
      </div>

      {/* Mobile related docs */}
      <div className="lg:hidden mx-auto max-w-3xl px-4 pb-24 sm:px-6">
        <RelatedDocsPanel docs={related} currentSlug={meta.slug} />
      </div>
    </div>
  );
}

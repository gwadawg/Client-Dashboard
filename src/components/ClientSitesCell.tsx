"use client";

import { clientSiteEntries, hrefForSiteUrl, type ClientSiteUrls } from "@/lib/client-sites";

/** Compact Personal · Landing · Perspective · TY link row for tables. */
export default function ClientSitesCell({
  urls,
  stopRowClick,
}: {
  urls: ClientSiteUrls;
  /** When true, link clicks do not open the parent row (roster tables). */
  stopRowClick?: boolean;
}) {
  const entries = clientSiteEntries(urls);
  const any = entries.some(e => e.url);

  if (!any) {
    return <span className="text-xs" style={{ color: "#334155" }}>—</span>;
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs">
      {entries.map((e, i) => (
        <span key={e.key} className="inline-flex items-center gap-1">
          {i > 0 && <span style={{ color: "#334155" }}>·</span>}
          {e.url ? (
            <a
              href={hrefForSiteUrl(e.url)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={stopRowClick ? ev => ev.stopPropagation() : undefined}
              className="font-medium whitespace-nowrap underline-offset-2 hover:underline"
              style={{ color: "#38bdf8" }}
              title={`${e.label}: ${e.url}`}
            >
              {e.short}
            </a>
          ) : (
            <span className="whitespace-nowrap" style={{ color: "#334155" }} title={`${e.label}: not set`}>
              {e.short}
            </span>
          )}
        </span>
      ))}
    </span>
  );
}

"use client";

import { useState } from "react";
import {
  formatSeconds,
  isDirectAudioUrl,
  recordingUrlAtSeconds,
  teamCallTypeLabel,
  type CallHighlight,
  type TeamCallRow,
} from "@/lib/team-calls";

type Props = {
  call: TeamCallRow;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
  deleting?: boolean;
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return "—";
  return formatSeconds(seconds);
}

function HighlightRow({
  highlight,
  recordingUrl,
}: {
  highlight: CallHighlight;
  recordingUrl: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const timeLabel = formatSeconds(highlight.at_seconds);
  const link = recordingUrl ? recordingUrlAtSeconds(recordingUrl, highlight.at_seconds) : null;
  const copyText = `${timeLabel} — ${highlight.label}: ${highlight.takeaway}`.trim();

  async function copy() {
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      className="rounded-lg p-3"
      style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div className="flex items-start gap-3">
        {link ? (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-xs font-mono font-bold px-2 py-1 rounded"
            style={{ color: "#f59e0b", background: "rgba(245,158,11,0.12)" }}
            title="Jump to moment in recording"
          >
            {timeLabel}
          </a>
        ) : (
          <span
            className="shrink-0 text-xs font-mono font-bold px-2 py-1 rounded"
            style={{ color: "#64748b", background: "rgba(100,116,139,0.12)" }}
          >
            {timeLabel}
          </span>
        )}
        <div className="flex-1 min-w-0">
          {highlight.label && (
            <p className="text-sm font-semibold" style={{ color: "#e2e8f0" }}>{highlight.label}</p>
          )}
          {highlight.takeaway && (
            <p className="text-sm mt-0.5" style={{ color: "#94a3b8" }}>{highlight.takeaway}</p>
          )}
        </div>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 text-xs px-2 py-1 rounded"
          style={{ color: copied ? "#34d399" : "#64748b" }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

export default function CallLibraryDetail({
  call,
  canManage,
  onEdit,
  onDelete,
  onClose,
  deleting,
}: Props) {
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);
  const highlights = call.highlights ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl h-full overflow-y-auto flex flex-col"
        style={{ background: "#060d1a", borderLeft: "1px solid rgba(255,255,255,0.08)" }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="sticky top-0 z-10 px-5 py-4 flex items-start justify-between gap-3"
          style={{ background: "#080f1e", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="min-w-0">
            <h2 className="text-lg font-bold truncate" style={{ color: "#f1f5f9" }}>{call.title}</h2>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span
                className="text-xs px-2 py-0.5 rounded-full font-semibold"
                style={{ color: "#a78bfa", background: "rgba(167,139,250,0.12)" }}
              >
                {teamCallTypeLabel(call.call_type)}
              </span>
              {call.is_private && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-semibold"
                  style={{ color: "#f87171", background: "rgba(248,113,113,0.12)" }}
                >
                  Private
                </span>
              )}
              {call.lead_type && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-semibold"
                  style={{ color: "#f59e0b", background: "rgba(245,158,11,0.12)" }}
                >
                  {call.lead_type}
                </span>
              )}
              {call.grade && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-semibold"
                  style={{ color: "#34d399", background: "rgba(52,211,153,0.12)" }}
                >
                  Grade {call.grade}
                </span>
              )}
              <span className="text-xs" style={{ color: "#64748b" }}>{formatDateTime(call.called_at)}</span>
              {call.duration_seconds != null && call.duration_seconds > 0 && (
                <span className="text-xs" style={{ color: "#64748b" }}>
                  {formatDuration(call.duration_seconds)}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm px-2 py-1 rounded shrink-0"
            style={{ color: "#64748b" }}
          >
            Close
          </button>
        </div>

        <div className="flex-1 px-5 py-4 space-y-5">
          {call.participants && (
            <section>
              <h3 className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: "#475569" }}>
                {call.source_event_id ? "Rep" : "Participants"}
              </h3>
              <p className="text-sm" style={{ color: "#cbd5e1" }}>{call.participants}</p>
            </section>
          )}

          {call.tags.length > 0 && (
            <section>
              <h3 className="text-xs uppercase tracking-wider font-semibold mb-2" style={{ color: "#475569" }}>
                Tags
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {call.tags.map(tag => (
                  <span
                    key={tag}
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{ color: "#38bdf8", background: "rgba(56,189,248,0.12)" }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </section>
          )}

          {call.recording_url && (
            <section>
              <h3 className="text-xs uppercase tracking-wider font-semibold mb-2" style={{ color: "#475569" }}>
                Recording
              </h3>
              {isDirectAudioUrl(call.recording_url) ? (
                <audio controls src={call.recording_url} className="w-full" preload="none" />
              ) : null}
              <a
                href={call.recording_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold inline-block mt-2"
                style={{ color: "#f59e0b" }}
              >
                Open recording
              </a>
            </section>
          )}

          {highlights.length > 0 && (
            <section>
              <h3 className="text-xs uppercase tracking-wider font-semibold mb-2" style={{ color: "#475569" }}>
                Highlight moments ({highlights.length})
              </h3>
              <div className="space-y-2">
                {highlights.map((h, i) => (
                  <HighlightRow key={i} highlight={h} recordingUrl={call.recording_url} />
                ))}
              </div>
            </section>
          )}

          {call.summary && (
            <section>
              <h3 className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: "#475569" }}>
                Summary
              </h3>
              <p className="text-sm whitespace-pre-wrap" style={{ color: "#94a3b8" }}>{call.summary}</p>
            </section>
          )}

          {call.transcript && (
            <section>
              <button
                type="button"
                onClick={() => setTranscriptExpanded(v => !v)}
                className="text-xs uppercase tracking-wider font-semibold mb-2"
                style={{ color: "#475569" }}
              >
                {transcriptExpanded ? "Hide transcript" : "Show transcript"}
              </button>
              {transcriptExpanded ? (
                <pre
                  className="text-xs whitespace-pre-wrap rounded-lg p-3 max-h-96 overflow-y-auto"
                  style={{ color: "#94a3b8", background: "#0a1628", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  {call.transcript}
                </pre>
              ) : (
                <p className="text-xs" style={{ color: "#64748b" }}>
                  {call.transcript.slice(0, 200)}{call.transcript.length > 200 ? "…" : ""}
                </p>
              )}
            </section>
          )}
        </div>

        {canManage && (
          <div
            className="sticky bottom-0 px-5 py-4 flex gap-2"
            style={{ background: "#080f1e", borderTop: "1px solid rgba(255,255,255,0.06)" }}
          >
            <button
              type="button"
              onClick={onEdit}
              className="text-sm font-semibold px-4 py-2 rounded-lg"
              style={{ color: "#38bdf8", background: "rgba(56,189,248,0.12)", border: "1px solid rgba(56,189,248,0.3)" }}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={deleting}
              className="text-sm font-semibold px-4 py-2 rounded-lg ml-auto"
              style={{ color: "#f87171", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)" }}
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

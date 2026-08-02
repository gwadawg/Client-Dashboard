"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import type { BillingWorkReport, BillingWorkRow } from "@/lib/billing-work-report";

function isYmd(value: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function money(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n || 0);
}

function pct(n: number): string {
  return `${(n || 0).toFixed(1)}%`;
}

function formatDay(value: string | null): string {
  if (!value) return "—";
  const day = value.slice(0, 10);
  const d = new Date(`${day}T12:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const STATUS_LABEL: Record<string, string> = {
  show: "Show",
  no_show: "No show",
  lo_bailed: "LO bailed",
  appointment_cancelled: "Cancelled",
  appointment_rescheduled: "Rescheduled",
  pending: "Pending",
};

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, { color: string; bg: string }> = {
    show: { color: "#166534", bg: "#dcfce7" },
    no_show: { color: "#991b1b", bg: "#fee2e2" },
    lo_bailed: { color: "#6b21a8", bg: "#f3e8ff" },
    appointment_cancelled: { color: "#475569", bg: "#e2e8f0" },
    appointment_rescheduled: { color: "#075985", bg: "#e0f2fe" },
    pending: { color: "#92400e", bg: "#fef3c7" },
  };
  const s = colors[status] ?? colors.pending;
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ color: s.color, background: s.bg }}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl px-4 py-3" style={{ background: "#fff", border: "1px solid #e2e8f0" }}>
      <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#64748b" }}>{label}</p>
      <p className="text-2xl font-bold mt-1" style={{ color: "#0f172a" }}>{value}</p>
      {sub && <p className="text-xs mt-0.5" style={{ color: "#94a3b8" }}>{sub}</p>}
    </div>
  );
}

function ChargePill({ billable, reason }: { billable: boolean; reason: string | null }) {
  if (billable) {
    return (
      <span
        className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold"
        style={{ color: "#166534", background: "#dcfce7" }}
      >
        Billable
      </span>
    );
  }
  return (
    <span title={reason ?? undefined} className="inline-flex flex-col gap-0.5 max-w-[14rem]">
      <span
        className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold w-fit"
        style={{ color: "#92400e", background: "#fef3c7" }}
      >
        Dupe — not charged
      </span>
      {reason && (
        <span className="text-[10px] leading-snug" style={{ color: "#a16207" }}>{reason}</span>
      )}
    </span>
  );
}

function LeadTable({
  title,
  rows,
  empty,
  showStatus,
  showCharge,
  billableCount,
}: {
  title: string;
  rows: BillingWorkRow[];
  empty: string;
  showStatus?: boolean;
  showCharge?: boolean;
  billableCount?: number;
}) {
  const colCount = 4 + (showStatus ? 1 : 0) + (showCharge ? 1 : 0);
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: "#0f172a" }}>
          {title}
        </h2>
        <span className="text-xs font-semibold" style={{ color: "#64748b" }}>
          {billableCount != null
            ? `${billableCount} billable · ${rows.length} listed`
            : rows.length}
        </span>
      </div>
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #e2e8f0", background: "#fff" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: "#64748b" }}>Lead</th>
              <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: "#64748b" }}>Phone</th>
              <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: "#64748b" }}>Appointment</th>
              <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: "#64748b" }}>Setter</th>
              {showStatus && (
                <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: "#64748b" }}>Status</th>
              )}
              {showCharge && (
                <th className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: "#64748b" }}>Charge</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-4 py-8 text-center text-xs" style={{ color: "#94a3b8" }}>
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr
                  key={row.id}
                  style={{
                    background: !row.billable && showCharge
                      ? "rgba(254,243,199,0.35)"
                      : i % 2 === 0 ? "#fff" : "#f8fafc",
                    borderTop: "1px solid #f1f5f9",
                    opacity: !row.billable && showCharge ? 0.85 : 1,
                  }}
                >
                  <td className="px-4 py-2.5 font-medium" style={{ color: "#0f172a" }}>{row.lead_name || "—"}</td>
                  <td className="px-4 py-2.5 font-mono text-xs" style={{ color: "#475569" }}>{row.lead_phone || "—"}</td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: "#475569" }}>
                    {formatDateTime(row.scheduled_at ?? row.occurred_at)}
                  </td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: "#64748b" }}>{row.agent_name || "—"}</td>
                  {showStatus && (
                    <td className="px-4 py-2.5"><StatusPill status={row.status} /></td>
                  )}
                  {showCharge && (
                    <td className="px-4 py-2.5">
                      <ChargePill billable={row.billable} reason={row.dupe_reason} />
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BillingWorkInner() {
  const { token } = useParams<{ token: string }>();
  const searchParams = useSearchParams();
  const start = searchParams.get("start_date");
  const end = searchParams.get("end_date");
  const cycleId = searchParams.get("cycle_id");

  const [report, setReport] = useState<BillingWorkReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isYmd(start) || !isYmd(end)) {
      queueMicrotask(() => {
        setError("A start_date and end_date are required.");
        setLoading(false);
      });
      return;
    }

    queueMicrotask(() => setLoading(true));
    const params = new URLSearchParams({
      token,
      start_date: start,
      end_date: end,
    });
    if (cycleId) params.set("cycle_id", cycleId);

    fetch(`/api/report/billing-work?${params}`)
      .then(async r => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Failed to load report");
        setReport(d);
        setError(null);
      })
      .catch(e => setError(e instanceof Error ? e.message : "Failed to load report"))
      .finally(() => setLoading(false));
  }, [token, start, end, cycleId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#f8fafc" }}>
        <p className="text-sm" style={{ color: "#64748b" }}>Loading billing work report…</p>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#f8fafc" }}>
        <p className="text-sm" style={{ color: "#b91c1c" }}>{error || "Report not found."}</p>
      </div>
    );
  }

  const { summary, charges } = report;

  return (
    <div className="min-h-screen billing-work-root" style={{ background: "#f1f5f9", color: "#0f172a" }}>
      <header
        className="px-6 py-5 flex items-center justify-between flex-wrap gap-3 billing-work-hide-print"
        style={{ background: "#0c1f3d", borderBottom: "1px solid rgba(200,150,12,0.35)" }}
      >
        <div>
          <p className="text-sm font-bold" style={{ color: "#f8fafc" }}>{report.client_name}</p>
          <p className="text-xs mt-0.5" style={{ color: "#94a3b8" }}>
            Billing work report · {formatDay(report.period_start)} → {formatDay(report.period_end)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="px-3 py-1.5 rounded-md text-xs font-bold"
          style={{ color: "#0c1f3d", background: "#f0b429" }}
        >
          Print / PDF
        </button>
      </header>

      <div className="hidden billing-work-print-only px-8 pt-8 pb-4">
        <p className="text-xl font-bold">{report.client_name}</p>
        <p className="text-sm" style={{ color: "#475569" }}>
          Billing work report · {formatDay(report.period_start)} → {formatDay(report.period_end)}
        </p>
        <p className="text-xs mt-1" style={{ color: "#64748b" }}>
          Itemized appointments we booked, showed, and LO-bailed — the work this invoice covers.
        </p>
      </div>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        <p className="text-sm billing-work-hide-print" style={{ color: "#64748b" }}>
          Same counting rules as Client KPIs (events by date recorded). Itemized shows, LO bails, and bookings — dials excluded.
        </p>

        <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <SummaryCard
            label="Booked"
            value={`${summary.unique_booked} / ${summary.booked}`}
            sub="unique / total"
          />
          <SummaryCard
            label="Shows (billable)"
            value={String(summary.unique_shows)}
            sub={`${summary.shows} events · ${Math.max(0, summary.shows - summary.unique_shows)} dupes`}
          />
          <SummaryCard
            label="LO bailed (billable)"
            value={String(summary.unique_lo_bailed)}
            sub={`${summary.lo_bailed} events · ${Math.max(0, summary.lo_bailed - summary.unique_lo_bailed)} not charged`}
          />
          <SummaryCard label="No shows" value={String(summary.no_shows)} />
          <SummaryCard label="Show rate" value={pct(summary.show_rate)} sub="of dispositioned (raw)" />
          <SummaryCard label="LO bail rate" value={pct(summary.lo_bail_rate)} sub="of booked (raw)" />
        </section>

        {charges && (
          <section className="rounded-xl p-5 space-y-3" style={{ background: "#fff", border: "1px solid #e2e8f0" }}>
            <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: "#0f172a" }}>
              Charges for this period
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between gap-4 px-3 py-2 rounded-lg" style={{ background: "#f8fafc" }}>
                <span style={{ color: "#64748b" }}>Base retainer</span>
                <span className="font-semibold">{money(charges.base_amount)}</span>
              </div>
              <div className="flex justify-between gap-4 px-3 py-2 rounded-lg" style={{ background: "#f8fafc" }}>
                <span style={{ color: "#64748b" }}>
                  Shows ({charges.show_count} × {money(charges.pay_per_show)})
                </span>
                <span className="font-semibold">{money(charges.show_count * charges.pay_per_show)}</span>
              </div>
              <div className="flex justify-between gap-4 px-3 py-2 rounded-lg" style={{ background: "#f8fafc" }}>
                <span style={{ color: "#64748b" }}>
                  LO bailed ({charges.bailed_count} × {money(charges.pay_per_bailed)})
                </span>
                <span className="font-semibold">{money(charges.bailed_count * charges.pay_per_bailed)}</span>
              </div>
              {charges.discount > 0 && (
                <div className="flex justify-between gap-4 px-3 py-2 rounded-lg" style={{ background: "#f8fafc" }}>
                  <span style={{ color: "#64748b" }}>Discount</span>
                  <span className="font-semibold">−{money(charges.discount)}</span>
                </div>
              )}
            </div>
            <div className="flex justify-between items-center pt-2 border-t" style={{ borderColor: "#e2e8f0" }}>
              <span className="text-sm font-semibold" style={{ color: "#0f172a" }}>Total</span>
              <span className="text-xl font-bold" style={{ color: "#0c1f3d" }}>{money(charges.total)}</span>
            </div>
            {charges.filed_show_count != null && charges.filed_bailed_count != null && (
              <p className="text-xs" style={{ color: "#b45309" }}>
                Charges use unique billable counts (dupes / bail→show excluded). Filed cycle still has {charges.filed_show_count} / {charges.filed_bailed_count} — Pull live counts → Save to update it.
              </p>
            )}
          </section>
        )}

        <LeadTable
          title="Shows"
          rows={report.shows}
          empty="No shows in this period."
          showCharge
          billableCount={summary.unique_shows}
        />
        <LeadTable
          title="LO bailed"
          rows={report.lo_bailed}
          empty="No LO bails in this period."
          showCharge
          billableCount={summary.unique_lo_bailed}
        />
        <LeadTable
          title="Appointments booked"
          rows={report.booked}
          empty="No appointments booked in this period."
          showStatus
        />
      </main>

      <footer className="text-center py-6 text-xs billing-work-hide-print" style={{ color: "#94a3b8" }}>
        Prepared for {report.client_name} · appointments only (no dials)
      </footer>

      <style jsx global>{`
        @media print {
          .billing-work-hide-print { display: none !important; }
          .billing-work-print-only { display: block !important; }
          .billing-work-root, .billing-work-root * {
            background: #fff !important;
            box-shadow: none !important;
          }
          body { background: #fff !important; }
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          section { page-break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}

export default function BillingWorkReportPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center" style={{ background: "#f8fafc" }}>
          <p className="text-sm" style={{ color: "#64748b" }}>Loading…</p>
        </div>
      }
    >
      <BillingWorkInner />
    </Suspense>
  );
}

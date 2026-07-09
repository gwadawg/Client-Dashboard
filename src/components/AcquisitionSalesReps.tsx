"use client";

export default function AcquisitionSalesReps() {
  return (
    <div className="space-y-4 max-w-2xl">
      <div className="rounded-xl px-5 py-4" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)" }}>
        <h2 className="text-lg font-semibold" style={{ color: "#fbbf24" }}>Sales rep rates have moved</h2>
        <p className="text-sm mt-2" style={{ color: "#94a3b8" }}>
          B2B setters are now managed in the unified <strong style={{ color: "#e2e8f0" }}>Employee Roster</strong> (Admin → Agent Roster).
          Set pay type to <strong style={{ color: "#e2e8f0" }}>B2B Setter</strong> and configure base, bonus, demo, and close rates there.
          Payroll runs from <strong style={{ color: "#e2e8f0" }}>Admin → Agent Payroll</strong>.
        </p>
      </div>
    </div>
  );
}

import type { ReactNode } from "react";

type Props = {
  title: string;
  children: ReactNode;
  footnote?: string;
  showDivider?: boolean;
};

export default function KpiSection({ title, children, footnote, showDivider }: Props) {
  return (
    <section>
      {showDivider && (
        <div className="mb-8" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }} />
      )}
      <h2 className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "#334155" }}>
        {title}
      </h2>
      {children}
      {footnote && (
        <p className="text-[10px] mt-3 px-1 leading-relaxed" style={{ color: "#475569" }}>
          {footnote}
        </p>
      )}
    </section>
  );
}

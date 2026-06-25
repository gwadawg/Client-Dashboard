"use client";

type Tab = { key: string; label: string };

type Props = {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (key: string) => void;
  children: React.ReactNode;
  /** When true, children fill remaining height and can scroll internally (e.g. Client Roster). */
  fill?: boolean;
};

export default function ViewHub({ tabs, activeTab, onTabChange, children, fill = false }: Props) {
  return (
    <div className={fill ? "flex flex-col flex-1 min-h-0 gap-6 min-w-0" : "space-y-6"}>
      <div className="shrink-0 overflow-x-auto -mx-1 px-1 pb-1">
        <div
          className="inline-flex p-1 rounded-full ring-1 ring-white/10"
          style={{ background: "rgba(255,255,255,0.04)" }}
        >
          {tabs.map(tab => {
            const active = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => onTabChange(tab.key)}
                className="relative px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]"
                style={
                  active
                    ? {
                        background: "rgba(245,158,11,0.14)",
                        color: "#f59e0b",
                        boxShadow: "inset 0 1px 1px rgba(255,255,255,0.12)",
                      }
                    : { color: "#64748b" }
                }
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className={fill ? "flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden" : undefined}>
        {children}
      </div>
    </div>
  );
}

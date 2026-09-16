"use client";

import SegmentedControl from "@/components/ui/SegmentedControl";

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
      <div className="shrink-0">
        <SegmentedControl
          segments={tabs}
          value={activeTab}
          onChange={onTabChange}
        />
      </div>
      <div className={fill ? "flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden" : undefined}>
        {children}
      </div>
    </div>
  );
}

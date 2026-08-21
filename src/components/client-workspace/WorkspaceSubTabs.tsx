"use client";

import type { HubTabDef } from "@/lib/nav";

type Props = {
  tabs: HubTabDef<string>[];
  activeTab: string;
  onTabChange: (key: string) => void;
};

/**
 * Level-2 tab bar. Deliberately a different shape from `ViewHub`'s amber pill —
 * an underlined rail reads as "inside" the pill row above it, so two tab levels
 * never look like two peer navigations.
 */
export default function WorkspaceSubTabs({ tabs, activeTab, onTabChange }: Props) {
  return (
    <div
      role="tablist"
      className="flex items-center gap-1 overflow-x-auto -mx-1 px-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      style={{ borderBottom: "1px solid var(--color-ws-hairline)" }}
    >
      {tabs.map(tab => {
        const active = tab.key === activeTab;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onTabChange(tab.key)}
            className="relative px-3 py-2 text-[13px] font-medium whitespace-nowrap transition-colors duration-200 ease-ws focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ws-accent)]/40 rounded-sm"
            style={{ color: active ? "var(--color-ws-text)" : "var(--color-ws-text-dim)" }}
          >
            {tab.label}
            <span
              aria-hidden
              className="absolute left-2 right-2 -bottom-px h-[2px] rounded-full transition-opacity duration-200 ease-ws"
              style={{
                background: "var(--color-ws-accent)",
                opacity: active ? 1 : 0,
              }}
            />
          </button>
        );
      })}
    </div>
  );
}

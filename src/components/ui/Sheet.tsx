"use client";

import type { ReactNode } from "react";
import ModalCloseButton from "@/components/ModalCloseButton";
import GlassPane from "./GlassPane";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  labelledBy?: string;
};

/** Modal sheet for a scoped task. Glass chrome over an opaque content area. */
export default function Sheet({ open, onClose, title, children, labelledBy }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        onClick={onClose}
      />
      <GlassPane
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="relative z-10 w-full max-w-lg rounded-sheet ring-1 ring-white/10"
      >
        {(title || labelledBy) && (
          <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.07]">
            {title ? (
              <h2 id={labelledBy} className="mr-auto text-base font-semibold text-[var(--color-ws-label)]">
                {title}
              </h2>
            ) : (
              <span className="mr-auto" />
            )}
            <ModalCloseButton onClose={onClose} />
          </div>
        )}
        <div className="p-5">{children}</div>
      </GlassPane>
    </div>
  );
}

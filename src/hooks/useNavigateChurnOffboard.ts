"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { churnFormHref } from "@/lib/internal-forms";

export function useNavigateChurnOffboard() {
  const router = useRouter();

  return useCallback(
    (clientId?: string | null) => {
      router.push(churnFormHref(clientId ?? undefined));
    },
    [router],
  );
}

"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import ChurnOffboardingPage from "@/components/ChurnOffboardingPage";

export default function ChurnFormRouteClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialClientId = searchParams.get("clientId");

  return (
    <ChurnOffboardingPage
      initialClientId={initialClientId}
      onClientIdChange={clientId => {
        const params = new URLSearchParams();
        if (clientId) params.set("clientId", clientId);
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      }}
    />
  );
}

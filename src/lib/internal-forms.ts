/** Built-in team forms — linkable at /forms/[slug], listed in Resources + /forms hub. */

export type InternalFormDef = {
  slug: string;
  title: string;
  description: string;
  href: string;
  audience: string;
  tags: string[];
};

export const INTERNAL_FORMS: InternalFormDef[] = [
  {
    slug: "churn",
    title: "Churn Offboarding",
    description:
      "When a client is leaving: capture exit feedback, complete the offboarding checklist, and sync churn to Mr. Waiz, ClickUp, and GHL.",
    href: "/forms/churn",
    audience: "Client Success",
    tags: ["churn", "offboarding", "cs"],
  },
  {
    slug: "onboard",
    title: "Client Onboarding",
    description: "Public form for new clients to submit onboarding details after sign-up.",
    href: "/onboard",
    audience: "Clients",
    tags: ["onboarding", "client-facing"],
  },
];

export function internalFormHref(slug: string, params?: Record<string, string>): string {
  const form = INTERNAL_FORMS.find(f => f.slug === slug);
  const base = form?.href ?? `/forms/${slug}`;
  if (!params || Object.keys(params).length === 0) return base;
  const qs = new URLSearchParams(params).toString();
  return `${base}?${qs}`;
}

export function churnFormHref(clientId?: string | null): string {
  return internalFormHref("churn", clientId ? { clientId } : undefined);
}

export function isChurnOffboardEligible(lifecycleStatus: string | null | undefined): boolean {
  return lifecycleStatus !== "churned";
}

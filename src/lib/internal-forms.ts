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
    slug: "eod-media-buyer",
    title: "EOD — Media Buyer / Ops",
    description:
      "End-of-day check-in for media buying and tech blocks. Accomplishments, unfinished work, productivity rating, and seat-specific shutdown items.",
    href: "/forms/eod/media-buyer",
    audience: "Media Buyer",
    tags: ["eod", "media-buyer", "daily"],
  },
  {
    slug: "eod-client-success",
    title: "EOD — Client Success",
    description:
      "End-of-day check-in for client health, launches, follow-ups, and people/payroll cadence.",
    href: "/forms/eod/client-success",
    audience: "Client Success",
    tags: ["eod", "client-success", "daily"],
  },
  {
    slug: "eod-ccm",
    title: "EOD — Call Center Manager",
    description:
      "End-of-day check-in for floor training, dial pace, Booking/Show, stack bugs, and setter EOD.",
    href: "/forms/eod/ccm",
    audience: "Call Center Manager",
    tags: ["eod", "ccm", "daily"],
  },
  {
    slug: "acquisition-demo-booked",
    title: "Demo Booking Credit",
    description:
      "Setter magic link after booking a demo — logs credit in Mr. Waiz and syncs Agent, booking source, and pipeline stage to GHL.",
    href: "/forms/acquisition/demo-booked",
    audience: "Acquisition setters",
    tags: ["acquisition", "setter", "demo"],
  },
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

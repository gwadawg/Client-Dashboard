/**
 * Waiz-owned stock body for educate (/learn) pages — from frozen demos.
 * Do not invent new compliance or product claims here.
 */

import type { VirtualCardProduct } from "./types";

export type EducateMyth = { said: string; truth: string; why: string };
export type EducateOutcome = { title: string; body: string; image: string; alt: string; tag?: string };
export type EducateStep = { title: string; body: string };
export type EducateLever = { label: string; title: string; body: string };
export type EducateUseCase = { tag: string; lead: string; body: string };
export type EducateCompareRow = { conventional: string; dscr: string; label: string };

export type RmEducateStock = {
  product: "rm";
  eyebrow: string;
  h1: string;
  promise: string;
  heroImage: string;
  heroAlt: string;
  levers: EducateLever[];
  mythsHeading: string;
  myths: EducateMyth[];
  outcomesHeading: string;
  outcomes: EducateOutcome[];
  hedge: string;
  stepsHeading: string;
  steps: EducateStep[];
  defaultLoNote: string;
  secondaryLinkLabel: string;
};

export type DscrEducateStock = {
  product: "dscr";
  eyebrow: string;
  h1Lead: string;
  h1Accent: string;
  sub: string;
  usecasesHeading: string;
  usecasesIntro: string;
  usecases: EducateUseCase[];
  outcomesHeading: string;
  outcomes: EducateOutcome[];
  hedge: string;
  compareHeading: string;
  compareRows: EducateCompareRow[];
  compareNote: string;
  readyHeading: string;
  ready: { label: string; tag: string }[];
  straightTalk: string;
  secondaryLinkLabel: string;
  textPromptTitle: string;
  textPromptBody: string;
};

export const RM_EDUCATE_STOCK: RmEducateStock = {
  product: "rm",
  eyebrow: "What a reverse mortgage actually is",
  h1: "Reverse mortgage basics: what changes, what stays the same.",
  promise:
    "Two things matter most for many retired homeowners: a monthly mortgage payment that can end, and equity in the home that can become cash to use, while you keep the title.",
  heroImage: "/virtual-card/rm/hero-couple-kitchen.png",
  heroAlt: "A retired couple talking over coffee at their kitchen table",
  levers: [
    {
      label: "Payment",
      title: "The monthly mortgage payment can stop",
      body: "If you still have a forward mortgage, it is typically paid off at closing. No required monthly mortgage payment on the new loan. Taxes, insurance, and upkeep still apply.",
    },
    {
      label: "Equity",
      title: "Built equity can become usable cash",
      body: "Lump sum, line of credit, monthly deposits, or a mix, for bills, repairs, care, or a buffer. You stay the homeowner.",
    },
  ],
  mythsHeading: "What people get wrong",
  myths: [
    {
      said: '"The bank takes my house."',
      truth: "You keep the title. The home stays yours.",
      why: "While you live there and keep up property taxes, insurance and maintenance.",
    },
    {
      said: '"My kids will inherit the debt."',
      truth: "Your family is never personally on the hook.",
      why: "The loan is repaid from the home's value, never from their pockets. Remaining equity goes to them.",
    },
    {
      said: `"I've heard the horror stories."`,
      truth: "Today's program is not those old headlines.",
      why: "Federally insured HECM loans require independent counseling and carry clear consumer protections.",
    },
  ],
  outcomesHeading: "What life can feel like",
  outcomes: [
    {
      title: "Cash flow with less juggling",
      body: "When a mortgage payment ends, that money can stay home. Groceries, utilities, and medications stop competing as hard.",
      image: "/virtual-card/rm/outcome-bills-calm.png",
      alt: "A retired homeowner going through the month's bills calmly",
    },
    {
      title: "Cash for the house you live in",
      body: "Equity can fund the roof, the bathroom, or the fix you've been putting off, while you are still the one living there.",
      image: "/virtual-card/rm/outcome-home-cared.png",
      alt: "A retired homeowner keeping up his front porch and garden",
    },
    {
      title: "Independence that stays with you",
      body: "A buffer or clearer monthly picture can mean family visits for coffee, not for bailouts.",
      image: "/virtual-card/rm/outcome-family-visit.png",
      alt: "Family visiting for coffee at home",
    },
  ],
  hedge:
    "Every home and situation is different. These are common outcomes, not guarantees or promises of amounts.",
  stepsHeading: "How it works",
  steps: [
    {
      title: "Talk it through",
      body: "A real conversation about your payment, your equity, and what you'd like life to look like. No forms, no pressure.",
    },
    {
      title: "Independent counseling",
      body: "A HUD-approved counselor, not the lender, walks you through it. Required by the federally insured program.",
    },
    {
      title: "You decide",
      body: "With your family, on your timeline. It's fine to say no.",
    },
  ],
  defaultLoNote:
    "Ask about ending a payment, unlocking equity, and what stays the same for your home. There are no silly questions.",
  secondaryLinkLabel: "How a reverse mortgage can help",
};

export const DSCR_EDUCATE_STOCK: DscrEducateStock = {
  product: "dscr",
  eyebrow: "A clearer look at DSCR refinance",
  h1Lead: "The property",
  h1Accent: "qualifies itself.",
  sub: "How investors refinance a rental on what it earns — not on what their tax returns admit to. Refinance and cash-out on property you already own.",
  usecasesHeading: "What operators use it for",
  usecasesIntro:
    "Three common moves on investment property you already own. Refinance and cash-out only.",
  usecases: [
    {
      tag: "Cash-out",
      lead: "Pull equity out and put it to work.",
      body: "Refinance cash-out on the property's rent vs payment. Use the proceeds for rehab, reserves, or the next acquisition you already have lined up — without selling the property to free the capital.",
    },
    {
      tag: "Exit",
      lead: "Refinance out of hard money or a short-term note.",
      body: "Take the current payoff and maturity date, price a longer-term DSCR refinance against the lease or rent roll, and replace the bridge before the note forces a scramble.",
    },
    {
      tag: "Structure",
      lead: "Refinance into (or keep) LLC vesting.",
      body: "Close with title in the entity that already holds the property. Underwriting runs on rent vs payment, so write-offs and personal income docs stay out of the approval basis.",
    },
  ],
  outcomesHeading: "What it can look like",
  outcomes: [
    {
      tag: "Cash-out",
      title: "The unit turn gets funded.",
      body: "Equity that was sitting in the walls pays for the renovation and the lease-up — without selling anything.",
      image: "/virtual-card/dscr/outcome-unit-turned.jpg",
      alt: "A fully renovated, empty apartment unit ready to lease",
    },
    {
      tag: "Exit",
      title: "The hard-money clock stops.",
      body: "The short-term note is paid off and replaced with a payment the rent is meant to cover. The maturity date stops running your month.",
      image: "/virtual-card/dscr/outcome-desk-closed.jpg",
      alt: "A closed leather portfolio, building keys, and plans on a walnut desk",
    },
    {
      tag: "Scale",
      title: "The next building is in reach.",
      body: "Proceeds become the down payment or reserves on the one you already have your eye on — each property underwritten on its own rent.",
      image: "/virtual-card/dscr/outcome-block-aerial.jpg",
      alt: "Aerial view of a city block of small apartment buildings at golden hour",
    },
  ],
  hedge:
    "Every property and program is different. These are common outcomes, not promises about your numbers.",
  compareHeading: "Bank vs DSCR",
  compareRows: [
    { label: "Qualifies on", conventional: "W-2s, tax returns, DTI", dscr: "Rent vs payment" },
    { label: "Write-offs", conventional: "Work against you", dscr: "Not the basis of approval" },
    { label: "Vesting", conventional: "Personal name", dscr: "LLC allowed" },
    {
      label: "Portfolio",
      conventional: "Property-count ceiling",
      dscr: "Underwritten property by property",
    },
  ],
  compareNote: "Conceptual. Specific terms depend on the property and program.",
  readyHeading: "What to have ready",
  ready: [
    { label: "Current lease or rent roll", tag: "Income basis" },
    { label: "Current payoff statement and any maturity date", tag: "Exit timing" },
    { label: "Entity docs, if title sits in an LLC", tag: "Structure" },
    {
      label: "Where the cash-out proceeds go (rehab, reserves, next property)",
      tag: "Proceeds",
    },
  ],
  straightTalk:
    "Rates are often higher than conventional. The trade is access, freed equity, and a process built for how investors actually hold property. Investment-property refinance only. Your numbers depend on the property, the rent, and the program — nobody can tell you them from a web page.",
  secondaryLinkLabel: "How DSCR refinancing works",
  textPromptTitle: "Have a property in mind?",
  textPromptBody:
    "Text me the address and current rent — I'll tell you plainly whether it's worth a conversation.",
};

export function educateStock(product: VirtualCardProduct): RmEducateStock | DscrEducateStock {
  return product === "dscr" ? DSCR_EDUCATE_STOCK : RM_EDUCATE_STOCK;
}

export function secondaryLearnLabel(product: VirtualCardProduct): string {
  return product === "dscr"
    ? DSCR_EDUCATE_STOCK.secondaryLinkLabel
    : RM_EDUCATE_STOCK.secondaryLinkLabel;
}

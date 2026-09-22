import { createAnonClient, createServiceClient } from "@/lib/supabase";
import { draftToVirtualCard, parseVirtualCardDraft } from "./intake";
import { getPublishedCardBySlug } from "./storage";
import type { VirtualCard } from "./types";

/**
 * Hardcoded fallback for Paul until (or unless) a published DB row exists.
 * Do not invent bookingUrl.
 */
export const VIRTUAL_CARDS_FALLBACK: Record<string, VirtualCard> = {
  "paul-scheper": {
    slug: "paul-scheper",
    clientId: "38ae2cf1-67e9-4bd6-8bbc-5c37e4b331a7",
    fullName: "Paul Scheper",
    title: "Loan Officer",
    company: "Loangevity Mortgage",
    nmls: "1618305",
    statesLicensed: ["CA"],
    phone: "9496367242",
    email: "TeamScheper@outlook.com",
    headshotUrl:
      "https://fszmndldcvrrmitfbwde.supabase.co/storage/v1/object/public/client-headshots/3e331d02-98c8-4cce-92d6-0a4aa3988a3e.jpg",
    valueLine:
      "Helping California homeowners unlock home equity — without a new monthly mortgage payment.",
    product: "rm",
    stylePackId: "forest",
    accentColor: "#3a6a58",
    secondaryLinks: [
      {
        label: "How a reverse mortgage can help",
        href: "/paul-scheper/learn",
      },
    ],
  },
};

async function loadPublishedCard(slug: string): Promise<VirtualCard | null> {
  // Prefer service role; fall back to anon if env is incomplete (public read path).
  let client;
  try {
    client = createServiceClient();
  } catch {
    client = createAnonClient();
  }
  const published = await getPublishedCardBySlug(client, slug);
  if (!published?.responses) return null;
  const draft = parseVirtualCardDraft(published.responses);
  if (!draft.slug || !draft.fullName) return null;
  return draftToVirtualCard(draft, published.clientId ?? undefined);
}

export async function getVirtualCardAsync(slug: string): Promise<VirtualCard | null> {
  const key = slug.trim().toLowerCase();
  if (!key) return null;

  try {
    const fromDb = await loadPublishedCard(key);
    if (fromDb) return fromDb;
  } catch (e) {
    console.error("[virtual-card] DB lookup failed", e);
  }

  return VIRTUAL_CARDS_FALLBACK[key] ?? null;
}

/** Sync fallback for tests / legacy callers. Prefers hardcoded map only. */
export function getVirtualCard(slug: string): VirtualCard | null {
  const key = slug.trim().toLowerCase();
  if (!key) return null;
  return VIRTUAL_CARDS_FALLBACK[key] ?? null;
}

export function listVirtualCardSlugs(): string[] {
  return Object.keys(VIRTUAL_CARDS_FALLBACK);
}

/**
 * Virtual Card intake — draft shape, prefill from clients + launch_kit calendar, validation.
 */

import { normalizeReportingType } from "@/lib/reporting-types";
import { defaultStylePackId, getStylePack, listStylePacks } from "./packs";
import { secondaryLearnLabel } from "./educate-stock";
import {
  cardPublicUrl,
  learnPath,
  type VirtualCard,
  type VirtualCardProduct,
} from "./types";

export const VIRTUAL_CARD_TEMPLATE_VERSION = "2026-09-22";

export type VirtualCardDraft = {
  slug: string;
  fullName: string;
  title: string;
  company: string;
  nmls: string;
  statesLicensed: string[];
  phone: string;
  email: string;
  headshotUrl: string;
  valueLine: string;
  product: VirtualCardProduct | "";
  stylePackId: string;
  /** When true, bookingUrl is required on publish. */
  bookingNeeded: boolean;
  bookingUrl: string;
  bookingLabel: string;
  loNote: string;
};

export const VIRTUAL_CARD_CLIENT_FIELDS =
  "id, name, lifecycle_status, primary_contact_name, brokerage_name, legal_business_name, reporting_type, nmls, email, phone, phone_ghl, states_licensed, ghl_location_id, virtual_card_slug, virtual_business_card_url";

export type VirtualCardClient = {
  id: string;
  name: string;
  lifecycle_status: string | null;
  primary_contact_name: string | null;
  brokerage_name: string | null;
  legal_business_name: string | null;
  reporting_type: string | null;
  nmls: string | null;
  email: string | null;
  phone: string | null;
  phone_ghl?: string | null;
  states_licensed: string[] | null;
  ghl_location_id?: string | null;
  headshot_url?: string | null;
  virtual_card_slug: string | null;
  virtual_business_card_url: string | null;
};

export function emptyVirtualCardDraft(): VirtualCardDraft {
  return {
    slug: "",
    fullName: "",
    title: "Loan Officer",
    company: "",
    nmls: "",
    statesLicensed: [],
    phone: "",
    email: "",
    headshotUrl: "",
    valueLine: "",
    product: "",
    stylePackId: "",
    bookingNeeded: true,
    bookingUrl: "",
    bookingLabel: "Book a call",
    loNote: "",
  };
}

export function productFromReportingType(reportingType: unknown): VirtualCardProduct | "" {
  const raw = String(reportingType ?? "").trim();
  if (!raw) return "";
  const v = normalizeReportingType(raw);
  if (v === "RM") return "rm";
  if (v === "DSCR") return "dscr";
  return "";
}

/** kebab-case slug from a display name. */
export function slugifyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function strArr(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.map(x => String(x).trim()).filter(Boolean);
  }
  if (typeof v === "string" && v.trim()) {
    return v.split(/[,|]/).map(s => s.trim()).filter(Boolean);
  }
  return [];
}

export function parseVirtualCardDraft(raw: unknown): VirtualCardDraft {
  const base = emptyVirtualCardDraft();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const productRaw = str(r.product).toLowerCase();
  const product: VirtualCardProduct | "" =
    productRaw === "rm" || productRaw === "dscr" ? productRaw : "";

  return {
    slug: str(r.slug).toLowerCase(),
    fullName: str(r.fullName) || str(r.full_name),
    title: str(r.title) || "Loan Officer",
    company: str(r.company),
    nmls: str(r.nmls).replace(/\D/g, ""),
    statesLicensed: strArr(r.statesLicensed ?? r.states_licensed),
    phone: str(r.phone),
    email: str(r.email),
    headshotUrl: str(r.headshotUrl) || str(r.headshot_url),
    valueLine: str(r.valueLine) || str(r.value_line),
    product,
    stylePackId: str(r.stylePackId) || str(r.style_pack_id),
    bookingNeeded: r.bookingNeeded === false || r.booking_needed === false ? false : true,
    bookingUrl: str(r.bookingUrl) || str(r.booking_url),
    bookingLabel: str(r.bookingLabel) || str(r.booking_label) || "Book a call",
    loNote: str(r.loNote) || str(r.lo_note),
  };
}

export function draftToResponses(draft: VirtualCardDraft): Record<string, unknown> {
  return {
    slug: draft.slug,
    fullName: draft.fullName,
    title: draft.title,
    company: draft.company,
    nmls: draft.nmls,
    statesLicensed: draft.statesLicensed,
    phone: draft.phone,
    email: draft.email,
    headshotUrl: draft.headshotUrl,
    valueLine: draft.valueLine,
    product: draft.product,
    stylePackId: draft.stylePackId,
    bookingNeeded: draft.bookingNeeded,
    bookingUrl: draft.bookingUrl,
    bookingLabel: draft.bookingLabel,
    loNote: draft.loNote,
    template_version: VIRTUAL_CARD_TEMPLATE_VERSION,
  };
}

function firstNameFrom(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName;
}

export function draftFromClient(
  client: VirtualCardClient,
  previousResponses: Record<string, unknown> | null,
  opts?: { calendarUrl?: string | null; headshotUrl?: string | null },
): VirtualCardDraft {
  const prev = previousResponses ? parseVirtualCardDraft(previousResponses) : emptyVirtualCardDraft();
  const product = prev.product || productFromReportingType(client.reporting_type);
  const company =
    prev.company ||
    client.brokerage_name?.trim() ||
    client.legal_business_name?.trim() ||
    "";
  const fullName = prev.fullName || client.primary_contact_name?.trim() || client.name.trim();
  const slug = prev.slug || client.virtual_card_slug?.trim() || slugifyName(fullName);
  const stylePackId =
    prev.stylePackId || (product ? defaultStylePackId(product) : "");

  const calendar = opts?.calendarUrl?.trim() || "";
  const bookingUrl = prev.bookingUrl || calendar;
  const headshot =
    prev.headshotUrl || opts?.headshotUrl?.trim() || client.headshot_url?.trim() || "";

  return {
    slug,
    fullName,
    title: prev.title || "Loan Officer",
    company,
    nmls: prev.nmls || (client.nmls ?? "").replace(/\D/g, ""),
    statesLicensed: prev.statesLicensed.length
      ? prev.statesLicensed
      : (client.states_licensed ?? []).map(s => String(s).trim()).filter(Boolean),
    phone: prev.phone || (client.phone_ghl ?? "").trim(),
    email: prev.email || (client.email ?? "").trim(),
    headshotUrl: headshot,
    valueLine: prev.valueLine,
    product,
    stylePackId,
    bookingNeeded: previousResponses ? prev.bookingNeeded : true,
    bookingUrl,
    bookingLabel: prev.bookingLabel || "Book a call",
    loNote: prev.loNote,
  };
}

export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateForPublish(draft: VirtualCardDraft): string[] {
  const errors: string[] = [];
  if (!draft.slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug)) {
    errors.push("Slug must be kebab-case (letters, numbers, hyphens)");
  }
  if (!draft.fullName) errors.push("Full name is required");
  if (!draft.company) errors.push("Company is required");
  if (!draft.nmls) errors.push("NMLS is required");
  if (!draft.statesLicensed.length) errors.push("At least one licensed state is required");
  if (!draft.phone) errors.push("Phone is required");
  if (!draft.email || !draft.email.includes("@")) errors.push("Valid email is required");
  if (!draft.headshotUrl || !isHttpUrl(draft.headshotUrl)) {
    errors.push("Headshot must be a public https URL");
  }
  if (draft.product !== "rm" && draft.product !== "dscr") {
    errors.push("Product (RM or DSCR) is required");
  } else {
    const packs = listStylePacks(draft.product);
    if (!draft.stylePackId || !packs.some(p => p.pack_id === draft.stylePackId)) {
      errors.push("Choose a style pack");
    }
  }
  if (draft.bookingNeeded) {
    if (!draft.bookingUrl || !isHttpUrl(draft.bookingUrl)) {
      errors.push("Booking URL is required when booking is needed");
    }
  } else if (draft.bookingUrl && !isHttpUrl(draft.bookingUrl)) {
    errors.push("Booking URL must be http(s) if provided");
  }
  return errors;
}

/** Resolve draft → published VirtualCard (fills defaults). */
export function draftToVirtualCard(
  draft: VirtualCardDraft,
  clientId?: string,
): VirtualCard {
  const product = draft.product === "dscr" ? "dscr" : "rm";
  const pack = getStylePack(product, draft.stylePackId);
  const valueLine =
    draft.valueLine.trim() || pack.sample_value_line;
  const bookingUrl =
    draft.bookingNeeded && draft.bookingUrl.trim()
      ? draft.bookingUrl.trim()
      : draft.bookingNeeded
        ? undefined
        : draft.bookingUrl.trim() || undefined;

  return {
    slug: draft.slug,
    clientId,
    fullName: draft.fullName,
    title: draft.title || "Loan Officer",
    company: draft.company,
    nmls: draft.nmls,
    statesLicensed: draft.statesLicensed,
    phone: draft.phone,
    email: draft.email,
    headshotUrl: draft.headshotUrl,
    valueLine,
    product,
    stylePackId: pack.pack_id,
    bookingUrl,
    bookingLabel: draft.bookingLabel || "Book a call",
    loNote: draft.loNote || undefined,
    accentColor: pack.colors.accent,
    secondaryLinks: [
      {
        label: secondaryLearnLabel(product),
        href: learnPath(draft.slug),
      },
    ],
  };
}

export function smsSnippet(card: VirtualCard): string {
  const first = firstNameFrom(card.fullName);
  const url = cardPublicUrl(card.slug);
  return `Hi — here's ${first}'s contact card: ${url}`;
}

export function clientPatchFromPublish(card: VirtualCard): {
  virtual_card_slug: string;
  virtual_business_card_url: string;
} {
  return {
    virtual_card_slug: card.slug,
    virtual_business_card_url: cardPublicUrl(card.slug),
  };
}

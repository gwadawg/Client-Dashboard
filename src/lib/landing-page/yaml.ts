import YAML from "yaml";
import type { LandingDraft } from "./types";

function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** Factory yaml stores digits with a leading 1, no plus. */
export function phoneE164Digits(phone: string): string {
  const d = phoneDigits(phone);
  if (d.length === 10) return `1${d}`;
  if (d.length === 11 && d.startsWith("1")) return d;
  return d;
}

export function formatPhoneDisplay(phone: string): string {
  const d = phoneDigits(phone);
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d.length === 10 ? d : "";
  if (!ten) return phone.trim();
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

export function draftToYaml(draft: LandingDraft): string {
  const first = draft.firstName.trim() || draft.name.trim().split(/\s+/)[0] || "";
  const doc: Record<string, unknown> = {
    slug: draft.slug,
    theme: draft.theme,
    draft: false,
    preview: draft.preview,
  };
  if (draft.theme !== "theme-1" && draft.accent.trim()) {
    doc.brand = { accent: draft.accent.trim() };
  }
  doc.identity = {
    name: draft.name.trim(),
    firstName: first,
    title: draft.title.trim(),
    company: draft.company.trim(),
    tagline: draft.tagline.trim(),
    bio: draft.bio.trim(),
  };
  doc.contacts = {
    phone: formatPhoneDisplay(draft.phone),
    phoneE164: phoneE164Digits(draft.phone),
    email: draft.email.trim(),
    address: {
      streetAddress: draft.street.trim(),
      addressLocality: draft.city.trim(),
      addressRegion: draft.region.trim(),
      postalCode: draft.postalCode.trim(),
      addressCountry: "US",
    },
  };
  doc.compliance = {
    nmlsIndividual: draft.nmlsIndividual.trim(),
    nmlsCompany: draft.nmlsCompany.trim(),
    licenseSecondary: "",
    equalHousing: true,
    stateNotices: draft.stateNotices,
    sms: {
      status: draft.smsStatus,
      programName: `${draft.name.trim()} / ${draft.company.trim()}`,
      programDescription: "",
      frequency: "Message frequency varies.",
      consentLanguage: "",
    },
  };
  doc.products = {
    dscrRefinance: true,
    shortTermRental: false,
    primaryResidence: false,
  };
  doc.applyUrl = draft.applyUrl.trim();
  doc.bookingUrl = draft.bookingUrl.trim();
  doc.assets = {
    logo: "",
    headshot: "",
    vcf: "",
    ogImage: "",
  };
  return YAML.stringify(doc);
}

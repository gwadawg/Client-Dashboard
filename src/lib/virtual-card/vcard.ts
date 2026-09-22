import type { VirtualCard } from "./types";

/** Digits only for TEL / sms / tel links. */
export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** E.164 for US LO numbers stored as 10-digit or 1+10. */
export function phoneE164(phone: string): string {
  const d = phoneDigits(phone);
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  if (d.length === 10) return `+1${d}`;
  return d.startsWith("+") ? d : `+${d}`;
}

export function formatPhoneDisplay(phone: string): string {
  const d = phoneDigits(phone);
  if (d.length === 10) {
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  if (d.length === 11 && d.startsWith("1")) {
    return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  }
  return phone;
}

function escapeVCard(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

/** Build a vCard 3.0 body for Save contact. */
export function buildVCard(card: VirtualCard): string {
  const digits = phoneDigits(card.phone);
  const parts = card.fullName.trim().split(/\s+/);
  const first = parts[0] ?? card.fullName;
  const last = parts.length > 1 ? parts.slice(1).join(" ") : "";
  const states = card.statesLicensed.join(", ");
  const note = [`NMLS ${card.nmls}`, states ? `Licensed: ${states}` : ""].filter(Boolean).join(" · ");

  const cardUrl = `https://loanofficer.me/${card.slug}`;
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${escapeVCard(card.fullName)}`,
    `N:${escapeVCard(last)};${escapeVCard(first)};;;`,
    `ORG:${escapeVCard(card.company)}`,
    `TITLE:${escapeVCard(card.title)}`,
    `TEL;TYPE=CELL,VOICE:${digits}`,
    `EMAIL;TYPE=INTERNET:${escapeVCard(card.email)}`,
    `URL:${escapeVCard(cardUrl)}`,
    card.bookingUrl ? `URL;TYPE=Booking:${escapeVCard(card.bookingUrl)}` : null,
    note ? `NOTE:${escapeVCard(note)}` : null,
    "END:VCARD",
  ].filter((line): line is string => line != null);

  return lines.join("\r\n") + "\r\n";
}

/** Primary US reporting timezones (IANA). Stored in clients.timezone. */
export const US_CLIENT_TIMEZONES = [
  { value: "America/New_York", label: "Eastern (ET)" },
  { value: "America/Chicago", label: "Central (CT)" },
  { value: "America/Denver", label: "Mountain (MT)" },
  { value: "America/Phoenix", label: "Arizona (MST, no DST)" },
  { value: "America/Los_Angeles", label: "Pacific (PT)" },
  { value: "America/Anchorage", label: "Alaska (AKT)" },
  { value: "Pacific/Honolulu", label: "Hawaii (HST)" },
] as const;

const KNOWN = new Set<string>(US_CLIENT_TIMEZONES.map(t => t.value));

export function isKnownUsClientTimezone(value: string | null | undefined): boolean {
  return !!value && KNOWN.has(value);
}

export function timezoneLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const match = US_CLIENT_TIMEZONES.find(t => t.value === value);
  return match ? match.label : value;
}

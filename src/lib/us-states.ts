/** US states + DC as 2-letter codes (matches clients.states_licensed). */
export const US_STATES = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
] as const;

const VALID_CODES = new Set<string>(US_STATES.map(s => s.code));

const STATE_NAME_BY_CODE = Object.fromEntries(US_STATES.map(s => [s.code, s.name])) as Record<string, string>;

export type UsStateRegion = "West" | "Midwest" | "South" | "Northeast";

const STATE_REGION_BY_CODE: Record<string, UsStateRegion> = {
  AK: "West", AZ: "West", CA: "West", CO: "West", HI: "West", ID: "West",
  MT: "West", NM: "West", NV: "West", OR: "West", UT: "West", WA: "West", WY: "West",
  IA: "Midwest", IL: "Midwest", IN: "Midwest", KS: "Midwest", MI: "Midwest", MN: "Midwest",
  MO: "Midwest", ND: "Midwest", NE: "Midwest", OH: "Midwest", SD: "Midwest", WI: "Midwest",
  AL: "South", AR: "South", DC: "South", DE: "South", FL: "South", GA: "South",
  KY: "South", LA: "South", MD: "South", MS: "South", NC: "South", OK: "South",
  SC: "South", TN: "South", TX: "South", VA: "South", WV: "South",
  CT: "Northeast", MA: "Northeast", ME: "Northeast", NH: "Northeast", NJ: "Northeast",
  NY: "Northeast", PA: "Northeast", RI: "Northeast", VT: "Northeast",
};

const REGION_ORDER: UsStateRegion[] = ["West", "Midwest", "South", "Northeast"];

export function usStateName(code: string): string {
  return STATE_NAME_BY_CODE[code.toUpperCase()] ?? code;
}

export type LicensedStateGroup = { region: UsStateRegion; codes: string[] };

/** Group licensed codes by census region, dropping empty regions. */
export function groupLicensedStates(codes: string[]): LicensedStateGroup[] {
  const buckets: Record<UsStateRegion, string[]> = {
    West: [],
    Midwest: [],
    South: [],
    Northeast: [],
  };
  for (const code of codes) {
    const region = STATE_REGION_BY_CODE[code];
    if (region) buckets[region].push(code);
  }
  return REGION_ORDER
    .map(region => ({ region, codes: buckets[region] }))
    .filter(group => group.codes.length > 0);
}

/** Normalize an API/user value to sorted unique 2-letter codes, or null if empty. */
export function normalizeStatesLicensed(input: unknown): string[] | null {
  if (input == null) return null;
  if (!Array.isArray(input)) return null;
  const codes = [...new Set(
    input
      .filter((s): s is string => typeof s === "string")
      .map(s => s.trim().toUpperCase())
      .filter(s => VALID_CODES.has(s)),
  )].sort();
  return codes.length ? codes : null;
}

export function formatStatesLicensed(codes: string[] | null | undefined): string {
  if (!codes?.length) return "—";
  return codes.join(", ");
}

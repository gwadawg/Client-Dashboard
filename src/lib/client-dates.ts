/** Normalize API date/timestamptz values for `<input type="date">`. */
export function toDateInputValue(value: string | null | undefined): string {
  if (!value) return "";
  const datePart = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : "";
}

/** Parse a roster date field from PATCH JSON into a DB-friendly timestamptz string. */
export function parseClientDatePatch(value: unknown): string | null {
  if (value === "" || value == null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes("T")) return trimmed;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return `${trimmed}T12:00:00.000Z`;
  return null;
}

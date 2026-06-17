/** Slugify heading text to match GitHub-style anchor IDs. */
export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/** Highlight [PLACEHOLDER] tokens in plain text. */
export function splitPlaceholders(text: string): Array<{ type: "text" | "placeholder"; value: string }> {
  const parts: Array<{ type: "text" | "placeholder"; value: string }> = [];
  const re = /(\[[A-Z][A-Z0-9 _]*\])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: "text", value: text.slice(last, m.index) });
    parts.push({ type: "placeholder", value: m[1] });
    last = m.index + m[1].length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts.length ? parts : [{ type: "text", value: text }];
}

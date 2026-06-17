import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { getDocBySlug, type LibraryDocMeta } from "./library-manifest";

const LIBRARY_ROOT = path.join(process.cwd(), "content", "library");

export type LibraryDocContent = {
  meta: LibraryDocMeta;
  body: string;
  frontmatter: Record<string, unknown>;
};

export function loadLibraryDoc(slug: string): LibraryDocContent | null {
  const meta = getDocBySlug(slug);
  if (!meta) return null;

  const filePath = path.join(LIBRARY_ROOT, meta.path);
  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, "utf8");
  const { data: frontmatter, content: body } = matter(raw);

  return { meta, body, frontmatter };
}

import { LIBRARY_MANIFEST } from "./library-manifest";

export function getAllLibrarySlugs(): string[] {
  return LIBRARY_MANIFEST.docs.map((d) => d.slug);
}

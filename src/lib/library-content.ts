import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { createServiceClient } from "./supabase";
import { getDocBySlug, type LibraryDocMeta } from "./library-manifest";
import { rowToDocMeta, type LibraryDocumentRow } from "./library-processor";

const LIBRARY_ROOT = path.join(process.cwd(), "content", "library");

export type LibraryDocContent = {
  meta: LibraryDocMeta;
  body: string;
  frontmatter: Record<string, unknown>;
  source: "db" | "filesystem";
};

function loadFromFilesystem(slug: string): LibraryDocContent | null {
  const meta = getDocBySlug(slug);
  if (!meta) return null;

  const filePath = path.join(LIBRARY_ROOT, meta.path);
  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, "utf8");
  const { data: frontmatter, content: body } = matter(raw);

  return { meta, body, frontmatter, source: "filesystem" };
}

async function loadFromDatabase(slug: string): Promise<LibraryDocContent | null> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("library_documents")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as LibraryDocumentRow;
  const meta = rowToDocMeta(row);

  return {
    meta,
    body: row.body,
    frontmatter: {},
    source: "db",
  };
}

export async function loadLibraryDoc(slug: string): Promise<LibraryDocContent | null> {
  const dbDoc = await loadFromDatabase(slug);
  if (dbDoc) return dbDoc;
  return loadFromFilesystem(slug);
}

export async function getAllLibrarySlugs(): Promise<string[]> {
  const slugs = new Set<string>();

  const service = createServiceClient();
  const { data } = await service.from("library_documents").select("slug");
  for (const row of data ?? []) {
    slugs.add(row.slug);
  }

  const manifest = await import("./library-manifest").then((m) => m.LIBRARY_DOCS);
  for (const doc of manifest) {
    slugs.add(doc.slug);
  }

  return Array.from(slugs);
}

export async function listLibraryDocumentsFromDb(): Promise<LibraryDocumentRow[]> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("library_documents")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) return [];
  return (data ?? []) as LibraryDocumentRow[];
}

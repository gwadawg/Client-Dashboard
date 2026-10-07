import { headshotPath } from "./products";

export type HeadshotExt = "png" | "jpg" | "jpeg" | "webp";

const BY_TYPE: Record<string, HeadshotExt> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
};

const BY_EXT: Record<string, HeadshotExt> = {
  png: "png",
  jpg: "jpg",
  jpeg: "jpeg",
  webp: "webp",
};

export function headshotExtension(source: {
  contentType?: string | null;
  filename?: string | null;
}): HeadshotExt {
  const type = (source.contentType ?? "").split(";")[0].trim().toLowerCase();
  if (type === "image/gif") {
    throw new Error("Headshot must be PNG, JPG, or WEBP");
  }
  if (BY_TYPE[type]) return BY_TYPE[type];
  const name = (source.filename ?? "").toLowerCase();
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : "";
  if (ext === "gif") throw new Error("Headshot must be PNG, JPG, or WEBP");
  if (BY_EXT[ext]) return BY_EXT[ext];
  throw new Error("Headshot must be PNG, JPG, or WEBP");
}

export function headshotRepoFile(
  slug: string,
  source: { contentType?: string | null; filename?: string | null },
): { path: string; extension: HeadshotExt } {
  const extension = headshotExtension(source);
  return { path: headshotPath(slug, extension), extension };
}

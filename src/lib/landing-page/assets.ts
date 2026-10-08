import type { SupabaseClient } from "@supabase/supabase-js";
import { headshotExtension, type HeadshotExt } from "./headshot";

/** Stay under the middleware body clone limit. */
export const BRAND_ASSET_MAX_BYTES = 4 * 1024 * 1024;

const CONTENT_TYPE: Record<HeadshotExt, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export type BrandAssetKind = "headshot" | "logo";

/** Storage object name from a public URL, used as the ID shown on the form. */
export function assetFileId(url: string | null | undefined): string | null {
  const raw = url?.trim();
  if (!raw) return null;
  try {
    const name = new URL(raw).pathname.split("/").filter(Boolean).pop() ?? "";
    const decoded = decodeURIComponent(name).trim();
    return decoded || null;
  } catch {
    return null;
  }
}

export async function downloadBrandAsset(
  url: string,
  label: string,
): Promise<{ bytes: Buffer; contentType: string; filename: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not download the ${label}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!bytes.length) throw new Error(`${label} file is empty`);
  let filename = label;
  try {
    filename = new URL(url).pathname;
  } catch {
    filename = label;
  }
  return {
    bytes,
    contentType: res.headers.get("content-type") ?? "",
    filename,
  };
}

export async function uploadBrandAsset(
  service: SupabaseClient,
  clientId: string,
  kind: BrandAssetKind,
  file: { name: string; type: string; bytes: Buffer },
): Promise<string> {
  const label = kind === "logo" ? "Logo" : "Headshot";
  if (!file.bytes.length) throw new Error(`${label} file is empty`);
  if (file.bytes.length > BRAND_ASSET_MAX_BYTES) {
    throw new Error(`${label} must be 4MB or smaller`);
  }
  let extension: HeadshotExt;
  try {
    extension = headshotExtension({ contentType: file.type, filename: file.name });
  } catch {
    throw new Error(`${label} must be PNG, JPG, or WEBP`);
  }
  const storageExt = extension === "jpeg" ? "jpg" : extension;
  const id = crypto.randomUUID();
  const path = kind === "logo" ? `logos/${id}.${storageExt}` : `${id}.${storageExt}`;
  const { error } = await service.storage.from("client-headshots").upload(path, file.bytes, {
    contentType: CONTENT_TYPE[extension],
    upsert: false,
  });
  if (error) throw new Error(error.message);
  const { data } = service.storage.from("client-headshots").getPublicUrl(path);
  const column = kind === "logo" ? "logo_url" : "headshot_url";
  const { error: updateError } = await service
    .from("clients")
    .update({ [column]: data.publicUrl })
    .eq("id", clientId);
  if (updateError) throw new Error(updateError.message);
  return data.publicUrl;
}

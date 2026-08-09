// lib/photos.ts — upload update photos to the private 'update-photos' bucket
// and resolve signed URLs for display. Paths are '{family_id}/{uuid}.{ext}'.
import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "update-photos";

function extOf(file: File) {
  const m = file.name.match(/\.([a-zA-Z0-9]+)$/);
  return (m ? m[1] : "jpg").toLowerCase();
}

// crypto.randomUUID is available in modern browsers
function uid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Re-encode an image through a canvas before upload. This DROPS all embedded
// metadata — crucially the GPS coordinates phones bake into photos (often the
// family's home) — while baking in the correct EXIF orientation so nothing ends
// up rotated. Videos pass through untouched (can't strip client-side); if
// anything fails we fall back to the original rather than block the upload.
async function stripMetadata(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0);
    if ("close" in bitmap) bitmap.close();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.92));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export async function uploadPhotos(
  supabase: SupabaseClient,
  familyId: string,
  files: File[]
): Promise<string[]> {
  const paths: string[] = [];
  for (const raw of files) {
    const file = await stripMetadata(raw);
    const path = `${familyId}/${uid()}.${extOf(file)}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined,
    });
    if (error) throw error;
    paths.push(path);
  }
  return paths;
}

// Resolve many storage paths to signed URLs in one call; returns a path->url map.
export async function signedUrlMap(
  supabase: SupabaseClient,
  paths: string[],
  expiresIn = 3600
): Promise<Record<string, string>> {
  const unique = [...new Set(paths)].filter(Boolean);
  if (!unique.length) return {};
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(unique, expiresIn);
  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.signedUrl && row.path) map[row.path] = row.signedUrl;
  }
  return map;
}

export async function deletePhotos(
  supabase: SupabaseClient,
  paths: string[]
) {
  if (!paths.length) return;
  await supabase.storage.from(BUCKET).remove(paths);
}

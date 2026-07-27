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

export async function uploadPhotos(
  supabase: SupabaseClient,
  familyId: string,
  files: File[]
): Promise<string[]> {
  const paths: string[] = [];
  for (const file of files) {
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

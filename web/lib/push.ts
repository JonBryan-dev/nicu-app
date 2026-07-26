// lib/push.ts — subscribe the current device to Web Push and store in Supabase
import type { SupabaseClient } from "@supabase/supabase-js";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function enablePush(supabase: SupabaseClient, profileId: string) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok: false, reason: "unsupported" };
  }
  const reg = await navigator.serviceWorker.register("/sw.js");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "denied" };

  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
      ),
    }));

  const json = sub.toJSON();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      profile_id: profileId,
      endpoint: sub.endpoint,
      p256dh: json.keys!.p256dh,
      auth: json.keys!.auth,
    },
    { onConflict: "endpoint" }
  );
  return { ok: !error, reason: error?.message };
}

// Call on every app load: silently re-sync if permission already granted
export async function resyncPush(supabase: SupabaseClient, profileId: string) {
  if (!("serviceWorker" in navigator)) return;
  if (Notification.permission !== "granted") return;
  await enablePush(supabase, profileId);
}

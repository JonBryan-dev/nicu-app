// supabase/functions/notify/index.ts
// Triggered by a Database Webhook on INSERT into public.notifications.
// Sends Web Push to every subscription of the family's recipient_role,
// excluding the actor. Deletes dead subscriptions (404/410).
//
// Secrets required:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (e.g. mailto:you@example.com)

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT")!,
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

type NotificationRow = {
  id: string;
  family_id: string;
  recipient_role: "parent" | "family" | "all";
  actor_id: string | null;
  title: string;
  body: string;
  url: string;
};

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const row: NotificationRow = payload.record; // DB webhook shape
    if (!row?.family_id) return new Response("no record", { status: 400 });

    // recipients: profiles in family with matching role, excluding the actor
    let q = supabase
      .from("profiles")
      .select("id, role")
      .eq("family_id", row.family_id);
    if (row.recipient_role !== "all") q = q.eq("role", row.recipient_role);
    const { data: profiles, error: pErr } = await q;
    if (pErr) throw pErr;

    const recipientIds = (profiles ?? [])
      .filter((p) => p.id !== row.actor_id)
      .map((p) => p.id);
    if (!recipientIds.length) return new Response("no recipients");

    const { data: subs, error: sErr } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .in("profile_id", recipientIds);
    if (sErr) throw sErr;

    const message = JSON.stringify({
      title: row.title,
      body: row.body,
      url: row.url ?? "/",
    });

    const results = await Promise.allSettled(
      (subs ?? []).map((s) =>
        webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          message,
        ).catch(async (err: { statusCode?: number }) => {
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await supabase.from("push_subscriptions").delete().eq("id", s.id);
          }
          throw err;
        })
      ),
    );

    const sent = results.filter((r) => r.status === "fulfilled").length;
    return new Response(JSON.stringify({ sent, total: subs?.length ?? 0 }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response("error", { status: 500 });
  }
});

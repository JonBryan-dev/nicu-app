// supabase/functions/delete-account/index.ts
// Full account + data erasure for GDPR "right to be forgotten". A PARENT calls
// this to delete their whole family space: every photo in storage, every row
// (cascaded from the families row), and every member's auth login.
//
// The caller is identified from their JWT; only a parent may trigger it. All
// destructive work uses the service-role key server-side — never the browser.
//
// Deploy:  supabase functions deploy delete-account
// Secrets required (already set for `notify`): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from "npm:@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const BUCKET = "update-photos";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    // identify the caller from their own JWT
    const asUser = createClient(URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: "not signed in" }, 401);

    const admin = createClient(URL, SERVICE);
    const { data: me } = await admin
      .from("profiles")
      .select("family_id, role")
      .eq("id", user.id)
      .single();
    if (!me) return json({ error: "no profile" }, 404);
    if (me.role !== "parent") return json({ error: "only a parent can delete the family space" }, 403);

    const familyId = me.family_id as string;

    // 1) every member's auth id (before we cascade the rows away)
    const { data: members } = await admin.from("profiles").select("id").eq("family_id", familyId);

    // 2) delete all photos under this family's folder
    const { data: files } = await admin.storage.from(BUCKET).list(familyId, { limit: 1000 });
    if (files && files.length) {
      await admin.storage.from(BUCKET).remove(files.map((f) => `${familyId}/${f.name}`));
    }

    // 3) delete the family — ON DELETE CASCADE removes profiles, updates, feeds,
    //    visit_slots, shift_blocks, journal_entries, notifications, settings…
    const { error: delErr } = await admin.from("families").delete().eq("id", familyId);
    if (delErr) return json({ error: delErr.message }, 500);

    // 4) delete each member's auth login
    for (const m of members ?? []) {
      await admin.auth.admin.deleteUser(m.id as string).catch(() => {});
    }

    return json({ ok: true, deletedMembers: members?.length ?? 0 }, 200);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "failed" }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// GET /api/evidence — fetches the Cochrane review list from PubMed E-utilities
// and returns it as JSON. Server-side only, dad-only, abstracts only.
//
// Gating mirrors /api/companion: signed in, role 'parent', and then one more
// step — parent_kind 'dad'. The privacy that matters is enforced by RLS on
// resp_events/evidence_notes; this check just keeps the route in step with the
// tab it serves.
//
// Never goes silent: on any upstream failure this returns 200 with an empty
// list and mode 'offline', because the client already holds a snapshot and a
// localStorage copy. A tired parent gets the library, not an error page.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { TOPICS, type Review } from "@/lib/evidence";
import { DELAY_MS, DELAY_MS_KEYED, efetch, esearch, latestVersions, sleep } from "@/lib/pubmed";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("not signed in", { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, parent_kind")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "parent") return new Response("parents only", { status: 403 });
  if (profile?.parent_kind !== "dad") return new Response("not your tab", { status: 403 });

  const apiKey = process.env.NCBI_API_KEY ?? "";
  const delay = apiKey ? DELAY_MS_KEYED : DELAY_MS;
  const opts = { apiKey, retmax: 40 };

  const reviews: Review[] = [];
  const failed: string[] = [];
  const seen = new Set<string>();

  for (const topic of TOPICS) {
    try {
      await sleep(delay);
      const pmids = (await esearch(topic.term, opts)).filter((p) => !seen.has(p));
      pmids.forEach((p) => seen.add(p));
      if (!pmids.length) continue;
      await sleep(delay);
      const articles = await efetch(pmids, opts);
      reviews.push(...articles.map((a) => ({ ...a, topic: topic.id })));
    } catch {
      failed.push(topic.id);
    }
  }

  if (!reviews.length) {
    return NextResponse.json(
      { reviews: [], fetchedAt: null, failed, mode: "offline" },
      { headers: { "X-Evidence-Mode": "offline" } }
    );
  }

  // dedupe to the latest version of each review, per topic
  const byTopicLatest = TOPICS.flatMap((t) =>
    latestVersions(reviews.filter((r) => r.topic === t.id))
  );

  return NextResponse.json(
    {
      reviews: byTopicLatest,
      fetchedAt: new Date().toISOString().slice(0, 10),
      failed,
      mode: "live",
    },
    { headers: { "X-Evidence-Mode": "live" } }
  );
}

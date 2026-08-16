// POST /api/companion — streaming chat for "Our NICU Companion". Server-side
// only (key in ANTHROPIC_API_KEY on Vercel), parents-only, strict system
// prompt embedding the whole knowledge base. Streams plain text. With no key,
// or on API failure, falls back to the keyword-matched offline answer and
// says so — the UI never goes silent on a tired parent.
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { systemPrompt, offlineAnswer } from "@/lib/companion";

export const runtime = "nodejs";
export const maxDuration = 60;

type Turn = { role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("not signed in", { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role, family_id").eq("id", user.id).maybeSingle();
  if (profile?.role !== "parent") return new Response("parents only", { status: 403 });
  const { data: fam } = await supabase.from("families").select("baby_name").eq("id", profile.family_id).maybeSingle();
  const babyName = (fam?.baby_name ?? "your baby").split(" ")[0];

  const body = (await req.json().catch(() => ({}))) as { messages?: Turn[] };
  const turns = (body.messages ?? []).filter((t) => t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string").slice(-20);
  const last = [...turns].reverse().find((t) => t.role === "user")?.content ?? "";
  if (!last.trim()) return new Response("empty", { status: 400 });

  const offline = (why: string) =>
    new Response(offlineAnswer(last), { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Companion-Mode": why } });

  if (!process.env.ANTHROPIC_API_KEY) return offline("offline-no-key");

  const client = new Anthropic();
  const encoder = new TextEncoder();
  try {
    const stream = client.messages.stream({
      model: "claude-opus-5",
      max_tokens: 1200,
      system: [{ type: "text", text: systemPrompt(babyName), cache_control: { type: "ephemeral" } }],
      messages: turns.map((t) => ({ role: t.role, content: t.content })),
      output_config: { effort: "medium" },
    });
    const readable = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
          const final = await stream.finalMessage();
          if (final.stop_reason === "refusal") {
            controller.enqueue(encoder.encode("\n\nI can't help with that one here — your neonatal team are the right people to ask."));
          }
        } catch {
          controller.enqueue(encoder.encode("\n\n" + offlineAnswer(last)));
        } finally {
          controller.close();
        }
      },
    });
    return new Response(readable, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Companion-Mode": "live" } });
  } catch {
    return offline("offline-error");
  }
}

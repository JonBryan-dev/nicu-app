// POST /api/extract — read a Radiometer ABL90 printout photo into numbers.
// Server-side only: the Anthropic key lives in ANTHROPIC_API_KEY on Vercel and
// never reaches the browser. The photo carries patient identifiers, so it is
// held in memory for the one API call and DISCARDED — never written to disk or
// storage. Only the extracted numeric values go back to the client, and the
// client must confirm them before anything is saved. Parents only.
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BOUNDS } from "@/lib/gas";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024;
const OK_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type OkType = (typeof OK_TYPES)[number];

// kept verbatim from the spec
const PROMPT =
  'This is a photo of a Radiometer ABL90 blood gas printout. Extract these values and respond with ONLY a JSON object, no markdown fences, no other text: {"ph": number|null, "co2_kpa": number|null (pCO2 in kPa), "hco3_std": number|null (cHCO3-(P,st)c standard bicarbonate), "glucose": number|null (cGlu mmol/L), "lactate": number|null (cLac mmol/L), "fio2": number|null (FO2(I) percent if printed), "sample_no": string|null (Sample #), "time": string|null (time printed at top of report), "date": string|null (date printed at top)}. Use null for anything not visible or not printed. If pCO2 is printed in mmHg, convert to kPa (divide by 7.5).';

const RETRY = "Couldn't read that photo. Try a straighter, brighter shot of the printout — or type the values in.";

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : null;
}
function inBounds(v: number | null, [lo, hi]: readonly [number, number]) {
  return v === null || (v >= lo && v <= hi);
}

export async function POST(req: Request) {
  // parents only — same gate as the rest of the gas feature
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "parent") return NextResponse.json({ error: "parents only" }, { status: 403 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Photo reading isn't switched on yet — type the values in for now." }, { status: 503 });
  }

  const form = await req.formData();
  const file = form.get("image");
  if (!(file instanceof File)) return NextResponse.json({ error: "no image" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That photo's over 10MB — try a smaller one." }, { status: 413 });
  const type = (file.type || "image/jpeg") as string;
  if (!OK_TYPES.includes(type as OkType)) {
    return NextResponse.json(
      { error: "That format can't be read (HEIC isn't supported yet) — take the photo with the camera button, or screenshot it and try again." },
      { status: 415 }
    );
  }

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const client = new Anthropic();
  try {
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 400, // the JSON is ~150 tokens; a tight cap keeps latency down
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: type as OkType, data: base64 } },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    });
    // the image is now out of scope — nothing retains it
    if (msg.stop_reason === "refusal") return NextResponse.json({ error: RETRY }, { status: 422 });
    const text = msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n");
    const clean = text.replace(/```json|```/g, "").trim();
    let j: Record<string, unknown>;
    try {
      j = JSON.parse(clean);
    } catch {
      return NextResponse.json({ error: RETRY }, { status: 422 });
    }
    const values = {
      ph: num(j.ph),
      co2_kpa: num(j.co2_kpa),
      hco3_std: num(j.hco3_std),
      glucose: num(j.glucose),
      lactate: num(j.lactate),
      fio2: num(j.fio2),
      sample_no: typeof j.sample_no === "string" ? j.sample_no : null,
      time: typeof j.time === "string" ? j.time : null,
      date: typeof j.date === "string" ? j.date : null,
    };
    const valid =
      inBounds(values.ph, BOUNDS.ph) &&
      inBounds(values.co2_kpa, BOUNDS.co2) &&
      inBounds(values.hco3_std, BOUNDS.hco3) &&
      inBounds(values.glucose, BOUNDS.glu) &&
      inBounds(values.lactate, BOUNDS.lac) &&
      inBounds(values.fio2, BOUNDS.fio2);
    if (!valid || (values.ph === null && values.co2_kpa === null)) {
      return NextResponse.json({ error: RETRY }, { status: 422 });
    }
    return NextResponse.json(values);
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "Busy right now — try again in a moment, or type the values in." }, { status: 429 });
    }
    if (e instanceof Anthropic.APIError) {
      return NextResponse.json({ error: RETRY }, { status: 502 });
    }
    return NextResponse.json({ error: RETRY }, { status: 500 });
  }
}

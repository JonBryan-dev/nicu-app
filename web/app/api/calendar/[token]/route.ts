// /api/calendar/[token] — private ICS subscription feed for the family.
// Auth is the unguessable token (calendar apps can't log in); data comes from
// the security-definer calendar_feed RPC using only the anon key.
// Times are emitted as floating local times — the whole family is in the UK.
import { createClient } from "@supabase/supabase-js";
import {
  computeSchedule,
  babyFeedTimes,
  DEFAULT_SETTINGS,
  type FeedSettingsRow,
  type SleepWindowRow,
  type FeedRow,
  type SlotRow,
} from "@/lib/feedSchedule";

export const dynamic = "force-dynamic";

type FeedPayload = {
  baby_name: string;
  settings: FeedSettingsRow | null;
  sleep_windows: SleepWindowRow[];
  feeds_today: FeedRow[];
  slots: SlotRow[];
  tasks: {
    task_text: string;
    claimer: string | null;
    slot: { slot_date: string; start_time: string; end_time: string } | null;
  }[];
};

const esc = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

// Vercel runs in UTC; the family lives on London wall-clock time. We shift all
// timestamps by London's current offset BEFORE scheduling/formatting, so the
// floating times in the ICS read correctly in the UK (incl. BST).
function londonOffsetMs(at: Date): number {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/London",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const p = Object.fromEntries(
    f.formatToParts(at).map((x) => [x.type, x.value])
  ) as Record<string, string>;
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute);
  return asUTC - at.getTime();
}

function dt(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}00`;
}
function dtFrom(dateStr: string, timeStr: string): string {
  return dateStr.replace(/-/g, "") + "T" + timeStr.slice(0, 5).replace(":", "") + "00";
}

function vevent(uid: string, start: string, end: string, summary: string): string {
  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${esc(summary)}`,
    "END:VEVENT",
  ].join("\r\n");
}

export async function GET(
  _req: Request,
  { params }: { params: { token: string } }
) {
  if (!/^[0-9a-f-]{36}$/i.test(params.token)) {
    return new Response("not found", { status: 404 });
  }
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
  const { data, error } = await supabase.rpc("calendar_feed", {
    p_token: params.token,
  });
  if (error || !data) return new Response("not found", { status: 404 });

  const feed = data as FeedPayload;
  const baby = feed.baby_name;
  const settings = feed.settings ?? DEFAULT_SETTINGS;
  const events: string[] = [];

  // shift everything onto London wall-clock (see londonOffsetMs)
  const off = londonOffsetMs(new Date());
  const nowLondon = new Date(Date.now() + off);
  const feedsShifted = feed.feeds_today.map((f) => ({
    ...f,
    started_at: new Date(+new Date(f.started_at) + off).toISOString(),
    ended_at: f.ended_at
      ? new Date(+new Date(f.ended_at) + off).toISOString()
      : f.ended_at,
  }));

  // today's remaining pump sessions
  const schedule = computeSchedule(settings, feedsShifted, feed.sleep_windows, feed.slots, nowLondon, { pumping: true });
  schedule
    .filter((s) => !s.logged)
    .forEach((s, i) => {
      const end = new Date(+s.at + 30 * 60000);
      const note =
        s.assigned === "pre-sleep"
          ? " (before sleep)"
          : s.assigned === "post-sleep"
            ? " (on waking)"
            : s.assigned === "pre-meal"
              ? " (before break)"
              : s.assigned === "post-meal"
                ? " (after break)"
                : "";
      events.push(
        vevent(
          `pump-${i}-${dt(s.at)}@nicu`,
          dt(s.at),
          dt(s.power ? new Date(+s.at + 60 * 60000) : end),
          s.power ? "💪 Power pump" : `🥛 Pump${note}`
        )
      );
    });

  // baby's ward-set feed times, today and tomorrow
  for (let d = 0; d < 2; d++) {
    const day = new Date(nowLondon);
    day.setDate(day.getDate() + d);
    const dateStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    for (const t of babyFeedTimes(settings, feed.slots, day)) {
      const [hh, mm] = t.time.split(":").map(Number);
      const endMin = hh * 60 + mm + 30;
      const endT = `${String(Math.floor((endMin % 1440) / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
      events.push(
        vevent(
          `babyfeed-${dateStr}-${t.time}@nicu`,
          dtFrom(dateStr, t.time),
          dtFrom(dateStr, endT),
          `🍼 ${baby} feed (unit)`
        )
      );
    }
  }

  // visiting slots (14 days)
  for (const s of feed.slots) {
    const label = s.booker ? `Visit — ${s.booker}` : "Visiting slot — free";
    events.push(
      vevent(
        `slot-${s.slot_date}-${s.start_time}@nicu`,
        dtFrom(s.slot_date, s.start_time),
        dtFrom(s.slot_date, s.end_time),
        `🏥 ${label} (${baby})`
      )
    );
  }

  // claimed hospital jobs with a linked slot
  for (const t of feed.tasks) {
    if (!t.slot) continue;
    events.push(
      vevent(
        `task-${t.slot.slot_date}-${t.slot.start_time}@nicu`,
        dtFrom(t.slot.slot_date, t.slot.start_time),
        dtFrom(t.slot.slot_date, t.slot.end_time),
        `💛 ${t.claimer ?? "Family"}: ${t.task_text}`
      )
    );
  }

  // protected sleep windows for the next 7 days
  const today = new Date(nowLondon);
  for (let d = 0; d < 7; d++) {
    const day = new Date(today);
    day.setDate(day.getDate() + d);
    const dateStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    for (const w of feed.sleep_windows) {
      const label = w.person === "mum" ? "Mum" : "Dad";
      const meal = w.kind === "meal";
      const wraps = w.end_time < w.start_time;
      const endDay = new Date(day);
      if (wraps) endDay.setDate(endDay.getDate() + 1);
      const endStr = `${endDay.getFullYear()}-${String(endDay.getMonth() + 1).padStart(2, "0")}-${String(endDay.getDate()).padStart(2, "0")}`;
      events.push(
        vevent(
          `${meal ? "meal" : "sleep"}-${w.person}-${w.start_time.slice(0, 5)}-${dateStr}@nicu`,
          dtFrom(dateStr, w.start_time),
          dtFrom(endStr, w.end_time),
          meal ? `🍽 ${label}'s meal break` : `😴 ${label}'s protected sleep`
        )
      );
    }
  }

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//NICU Companion//EN",
    `X-WR-CALNAME:${esc(baby + " — NICU")}`,
    "X-PUBLISHED-TTL:PT15M",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");

  return new Response(ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "cache-control": "private, max-age=300",
    },
  });
}

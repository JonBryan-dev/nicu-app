// lib/feedSchedule.ts — computes the day's feed grid.
// Model (per Jon): the first feed anchors a fixed grid, and each actual feed
// re-anchors the REMAINING day. Day/night can have different intervals
// (e.g. 2-hourly by day, 3-hourly overnight). Feeds falling inside a parent's
// protected sleep window are assigned to the other parent; feeds inside a
// booked visiting slot are flagged so the visitor can give them.

export interface FeedSettingsRow {
  interval_day_min: number; // legacy fixed day gap (fallback when feeds_per_day unset)
  interval_night_min: number | null; // overnight gap ("longest stretch")
  day_from: string; // 'HH:MM[:SS]'
  night_from: string;
  target_ml: number | null;
  feeds_per_day?: number | null; // when set, day gaps auto-computed
  // baby's ward-set feed plan (the unit does the feeds)
  baby_first_feed?: string | null; // 'HH:MM'
  baby_interval_min?: number | null;
  baby_ml?: number | null;
}
export interface SleepWindowRow {
  id?: string;
  person: "mum" | "dad";
  start_time: string;
  end_time: string;
}
export interface FeedRow {
  started_at: string;
  ended_at?: string | null;
  ml?: number | null;
}
export interface SlotRow {
  slot_date: string;
  start_time: string;
  end_time: string;
  booker?: string | null;
}
export interface ScheduleEntry {
  at: Date;
  logged: boolean;
  ml?: number | null;
  // feeds: 'Mum'/'Dad' = the awake parent; 'unit' = both asleep, ward covers.
  // pumping: 'pre-sleep'/'post-sleep' = session moved to bracket Mum's
  // protected sleep instead of landing inside it.
  assigned: "Mum" | "Dad" | "unit" | "pre-sleep" | "post-sleep" | null;
  duringVisit: string | null; // booker name or 'free slot'
}

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

/** is minute-of-day m inside window [start,end), handling overnight wrap */
function inWindow(m: number, start: string, end: string): boolean {
  const s = toMin(start),
    e = toMin(end);
  return s <= e ? m >= s && m < e : m >= s || m < e;
}

export const DEFAULT_SETTINGS: FeedSettingsRow = {
  interval_day_min: 180,
  interval_night_min: null,
  day_from: "08:00",
  night_from: "20:00",
  target_ml: null,
  feeds_per_day: 8,
};

/**
 * Day/night gaps. With feeds_per_day set, overnight feeds are spaced at the
 * chosen night stretch and the REMAINING feeds are spread evenly across the
 * day window — naturally producing a mix of 2/2½/3-hour gaps.
 */
export function computeGaps(s: FeedSettingsRow): {
  dayGap: number;
  nightGap: number;
} {
  const nightGap = s.interval_night_min ?? s.interval_day_min;
  let dayGap = s.interval_day_min;
  if (s.feeds_per_day) {
    const dayStart = toMin(s.day_from);
    const nightStart = toMin(s.night_from);
    const daySpan = (nightStart - dayStart + 1440) % 1440 || 720;
    const nightSpan = 1440 - daySpan;
    const nightCount = Math.max(0, Math.floor(nightSpan / nightGap));
    const dayCount = Math.max(1, s.feeds_per_day - nightCount);
    dayGap = Math.max(60, Math.round(daySpan / dayCount / 5) * 5);
  }
  return { dayGap, nightGap };
}

function intervalAt(minOfDay: number, s: FeedSettingsRow): number {
  const { dayGap, nightGap } = computeGaps(s);
  return inWindow(minOfDay, s.day_from, s.night_from) ? dayGap : nightGap;
}

function assignFor(
  minOfDay: number,
  windows: SleepWindowRow[]
): "Mum" | "Dad" | "unit" | null {
  const mumAsleep = windows.some(
    (w) => w.person === "mum" && inWindow(minOfDay, w.start_time, w.end_time)
  );
  const dadAsleep = windows.some(
    (w) => w.person === "dad" && inWindow(minOfDay, w.start_time, w.end_time)
  );
  if (mumAsleep && dadAsleep) return "unit"; // both asleep — the ward covers it
  if (mumAsleep) return "Dad";
  if (dadAsleep) return "Mum";
  return null;
}

/** Concrete Date bounds of a daily (possibly midnight-wrapping) window that
 *  contains `cand`, or null if `cand` is outside it. */
function windowBoundsAround(
  cand: Date,
  w: SleepWindowRow
): { start: Date; end: Date } | null {
  const s = toMin(w.start_time);
  const e = toMin(w.end_time);
  const candMin = cand.getHours() * 60 + cand.getMinutes();
  const mk = (dayOffset: number, minutes: number) => {
    const d = new Date(cand);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    return d;
  };
  if (s <= e) {
    if (candMin >= s && candMin < e) return { start: mk(0, s), end: mk(0, e) };
  } else {
    if (candMin >= s) return { start: mk(0, s), end: mk(1, e) };
    if (candMin < e) return { start: mk(-1, s), end: mk(0, e) };
  }
  return null;
}

const MIN_PUMP_GAP_MS = 45 * 60000;

/** Next pump after `from`: interval-stepped, but a session that would land in
 *  Mum's sleep brackets it — moved to just before the window (if there's a
 *  sensible gap since the last pump) or to waking time. */
function nextPump(
  from: Date,
  settings: FeedSettingsRow,
  windows: SleepWindowRow[]
): { at: Date; tag: "pre-sleep" | "post-sleep" | null } {
  const minOfDay = from.getHours() * 60 + from.getMinutes();
  const gapMs = intervalAt(minOfDay, settings) * 60000;
  const cand = new Date(+from + gapMs);
  for (const w of windows.filter((x) => x.person === "mum")) {
    const b = windowBoundsAround(cand, w);
    if (!b) continue;
    // pull the session forward to just before sleep only if a decent share of
    // the gap has passed — otherwise it waits until waking (no double-pumping
    // an hour apart around a sleep cycle)
    const preSleepOk =
      +b.start > +from &&
      +b.start - +from >= Math.max(MIN_PUMP_GAP_MS, gapMs * 0.5);
    if (preSleepOk) return { at: b.start, tag: "pre-sleep" };
    return { at: b.end, tag: "post-sleep" };
  }
  return { at: cand, tag: null };
}

function visitFor(at: Date, slots: SlotRow[]): string | null {
  const d = at;
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const m = d.getHours() * 60 + d.getMinutes();
  const s = slots.find(
    (sl) =>
      sl.slot_date === dateStr &&
      m >= toMin(sl.start_time) &&
      m < toMin(sl.end_time)
  );
  if (!s) return null;
  return s.booker ?? "free slot";
}

/**
 * Build today's schedule. `now` and all Dates are in the runtime's local time —
 * fine in the browser (parents are in the UK) and acceptable for the ICS feed
 * (emitted as floating local times).
 */
export function computeSchedule(
  settings: FeedSettingsRow,
  feedsToday: FeedRow[],
  windows: SleepWindowRow[],
  slots: SlotRow[],
  now: Date = new Date(),
  opts: { pumping?: boolean } = {}
): ScheduleEntry[] {
  const pumping = opts.pumping ?? false;
  const entries: ScheduleEntry[] = [];
  const sorted = [...feedsToday].sort(
    (a, b) => +new Date(a.started_at) - +new Date(b.started_at)
  );
  for (const f of sorted) {
    const at = new Date(f.started_at);
    entries.push({
      at,
      logged: true,
      ml: f.ml,
      assigned: null,
      duringVisit: null,
    });
  }

  // anchor: last actual feed today, else today's planned day_from
  let anchor: Date;
  if (sorted.length) {
    anchor = new Date(sorted[sorted.length - 1].started_at);
  } else {
    anchor = new Date(now);
    const [h, m] = settings.day_from.split(":").map(Number);
    anchor.setHours(h, m, 0, 0);
  }

  // project forward until tomorrow's day_from
  const endOfDay = new Date(now);
  endOfDay.setDate(endOfDay.getDate() + 1);
  const [eh, em] = settings.day_from.split(":").map(Number);
  endOfDay.setHours(eh, em, 0, 0);

  // planned first session when nothing's logged yet and the day hasn't started
  if (!sorted.length && anchor > now) {
    const aMin = anchor.getHours() * 60 + anchor.getMinutes();
    entries.push({
      at: new Date(anchor),
      logged: false,
      assigned: pumping ? null : assignFor(aMin, windows),
      duringVisit: visitFor(anchor, slots),
    });
  }

  let t = new Date(anchor);
  let guard = 0;
  while (guard++ < 30) {
    if (pumping) {
      // smarter stepping: sessions bracket Mum's sleep instead of landing in it
      const { at, tag } = nextPump(t, settings, windows);
      if (+at <= +t) break; // safety against zero-progress
      if (at >= endOfDay) break;
      entries.push({
        at: new Date(at),
        logged: false,
        assigned: tag,
        duringVisit: visitFor(at, slots),
      });
      t = at;
    } else {
      const minOfDay = t.getHours() * 60 + t.getMinutes();
      t = new Date(+t + intervalAt(minOfDay, settings) * 60000);
      if (t >= endOfDay) break;
      const mm = t.getHours() * 60 + t.getMinutes();
      entries.push({
        at: new Date(t),
        logged: false,
        assigned: assignFor(mm, windows),
        duringVisit: visitFor(t, slots),
      });
    }
  }
  return entries;
}

export function fmtHM(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Baby's ward-set feed times across 24h, flagged when they land in a visit. */
export function babyFeedTimes(
  s: FeedSettingsRow,
  slots: SlotRow[],
  today: Date = new Date()
): { time: string; duringVisit: string | null }[] {
  if (!s.baby_first_feed || !s.baby_interval_min) return [];
  const count = Math.max(1, Math.floor(1440 / s.baby_interval_min));
  const start = toMin(s.baby_first_feed);
  const out: { time: string; duringVisit: string | null }[] = [];
  for (let i = 0; i < count; i++) {
    const m = (start + i * s.baby_interval_min) % 1440;
    const t = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    const at = new Date(today);
    at.setHours(Math.floor(m / 60), m % 60, 0, 0);
    out.push({ time: t, duringVisit: visitFor(at, slots) });
  }
  return out.sort((a, b) => a.time.localeCompare(b.time));
}

/** Number of ward feeds per 24h under the unit plan (0 if unset). */
export function babyFeedsPerDay(s: FeedSettingsRow): number {
  return s.baby_interval_min ? Math.max(1, Math.floor(1440 / s.baby_interval_min)) : 0;
}

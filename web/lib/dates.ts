// lib/dates.ts — Europe/London period keys ('YYYY-MM-DD' and ISO 'IYYY-Www')
// and en-GB display formatting.

const LONDON = "Europe/London";

/** Today's date in Europe/London as 'YYYY-MM-DD'. */
export function todayKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: LONDON,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** ISO week key 'IYYY-Www' (e.g. 2026-W30) for a 'YYYY-MM-DD' date string. */
export function isoWeekKey(dateStr: string = todayKey()): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1, d));
  const dayNr = (target.getUTCDay() + 6) % 7; // Mon=0
  target.setUTCDate(target.getUTCDate() - dayNr + 3); // this week's Thursday
  const isoYear = target.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const ftDayNr = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ftDayNr + 3);
  const week =
    1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 864e5));
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

/** Day N of baby's journey — day 1 = birth day, counted in Europe/London. */
export function dayNumber(dob: string): number {
  const days =
    (Date.parse(todayKey() + "T00:00:00Z") - Date.parse(dob + "T00:00:00Z")) /
    864e5;
  return Math.floor(days) + 1;
}

// Deterministic en-GB style formatting (identical on server and client —
// toLocaleDateString varies across ICU builds and causes hydration mismatches)
const WDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 'Fri 24 Jul' from a 'YYYY-MM-DD' string. */
export function fmtDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return `${WDAYS[date.getUTCDay()]} ${d} ${MONTHS[m - 1]}`;
}

/** '24 Jul · 14:05' from a timestamp, in the viewer's local time. */
export function fmtStamp(ts: string): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getDate()} ${MONTHS[d.getMonth()]} · ${hh}:${mm}`;
}

/** 'HH:MM' from a Postgres time value 'HH:MM:SS'. */
export function fmtTime(t: string): string {
  return t.slice(0, 5);
}

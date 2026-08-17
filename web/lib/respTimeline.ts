// lib/respTimeline.ts — builds the breathing timeline. Pure functions, no I/O.
//
// Most of this is DERIVED rather than stored. Every blood gas already records
// which support she was on (gas_entries.support_mode, added in 028), so the
// ladder — intubations, extubations, reintubations, days on the ventilator,
// steps up and steps down — falls out of rows that are already there. The
// resp_events table (032) only carries what a gas cannot express: drug events,
// a planned trial, an event that happened when no gas was taken near it.
//
// Nothing here judges. compareToCohort places her numbers beside the cohort
// figures and stops; the phrasing never turns a comparison into a verdict,
// because a timeline cannot know what the team knows.

import { MODE_RANK, MODES, type SupportMode } from "@/lib/gas";

/** An extubation counts as having held if she didn't go back on the ventilator
 *  within this many days. */
export const SUCCESS_WINDOW_DAYS = 7;
/** A logged event this close to a derived one is the same event, logged twice. */
export const DEDUPE_WINDOW_HOURS = 6;

const DAY_MS = 864e5;
const ts = (s: string) => Date.parse(s);
const modeLabel = (m: SupportMode) => MODES.find((x) => x.id === m)?.label ?? m;

export type EventKind =
  | "intubation"
  | "extubation"
  | "extubation_trial"
  | "reintubation"
  | "surfactant"
  | "caffeine_start"
  | "caffeine_stop"
  | "steroid_start"
  | "steroid_stop"
  | "mode_change"
  | "step_up"
  | "step_down"
  | "other";

export const EVENT_LABEL: Record<EventKind, string> = {
  intubation: "Intubated",
  extubation: "Extubated",
  extubation_trial: "Extubation trial planned",
  reintubation: "Reintubated",
  surfactant: "Surfactant",
  caffeine_start: "Caffeine started",
  caffeine_stop: "Caffeine stopped",
  steroid_start: "Steroid course started",
  steroid_stop: "Steroid course finished",
  mode_change: "Support changed",
  step_up: "Stepped up",
  step_down: "Stepped down",
  other: "Noted",
};

/** The kinds a parent can log by hand. The derived-only ones (step_up,
 *  step_down) are deliberately absent — they come from the gases. */
export const LOGGABLE_KINDS: EventKind[] = [
  "intubation",
  "extubation",
  "reintubation",
  "extubation_trial",
  "surfactant",
  "caffeine_start",
  "caffeine_stop",
  "steroid_start",
  "steroid_stop",
  "mode_change",
  "other",
];

export interface LadderPoint {
  at: string;
  mode: SupportMode;
}

export interface TimelineEvent {
  at: string;
  kind: EventKind;
  label: string;
  source: "gas" | "logged";
  from?: SupportMode;
  to?: SupportMode;
  detail?: string | null;
  note?: string | null;
  id?: string;
}

export interface RespEventRow {
  id: string;
  kind: EventKind;
  at: string;
  detail: string | null;
  note: string | null;
}

// ---------- the ladder ----------

export function ladderFromGases(
  rows: { taken_at: string; support_mode: SupportMode | null }[]
): LadderPoint[] {
  return rows
    .filter((r): r is { taken_at: string; support_mode: SupportMode } => !!r.support_mode)
    .map((r) => ({ at: r.taken_at, mode: r.support_mode }))
    .sort((a, b) => ts(a.at) - ts(b.at));
}

/** Transitions between consecutive gas samples become events. A move onto the
 *  ventilator is an intubation the first time and a reintubation after that. */
export function derivedEvents(ladder: LadderPoint[]): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  let ventEpisodes = 0;
  if (ladder.length && ladder[0].mode === "vent") {
    ventEpisodes = 1;
    out.push({
      at: ladder[0].at,
      kind: "intubation",
      label: EVENT_LABEL.intubation,
      source: "gas",
      to: "vent",
    });
  }
  for (let i = 1; i < ladder.length; i++) {
    const prev = ladder[i - 1];
    const cur = ladder[i];
    if (prev.mode === cur.mode) continue;
    let kind: EventKind;
    if (cur.mode === "vent") {
      ventEpisodes += 1;
      kind = ventEpisodes > 1 ? "reintubation" : "intubation";
    } else if (prev.mode === "vent") {
      kind = "extubation";
    } else {
      kind = MODE_RANK[cur.mode] > MODE_RANK[prev.mode] ? "step_up" : "step_down";
    }
    out.push({
      at: cur.at,
      kind,
      label:
        kind === "step_up" || kind === "step_down"
          ? `${EVENT_LABEL[kind]} — ${modeLabel(prev.mode)} → ${modeLabel(cur.mode)}`
          : EVENT_LABEL[kind],
      source: "gas",
      from: prev.mode,
      to: cur.mode,
    });
  }
  return out;
}

/** A hand-logged event within DEDUPE_WINDOW_HOURS of a derived one of the same
 *  kind is the same event — his version wins, because it carries his note and
 *  the exact hour. */
export function mergeEvents(derived: TimelineEvent[], logged: RespEventRow[]): TimelineEvent[] {
  const window = DEDUPE_WINDOW_HOURS * 3600_000;
  const fromLog: TimelineEvent[] = logged.map((l) => ({
    at: l.at,
    kind: l.kind,
    label: EVENT_LABEL[l.kind] ?? EVENT_LABEL.other,
    source: "logged",
    detail: l.detail,
    note: l.note,
    id: l.id,
  }));
  const kept = derived.filter(
    (d) => !fromLog.some((l) => l.kind === d.kind && Math.abs(ts(l.at) - ts(d.at)) <= window)
  );
  return [...kept, ...fromLog].sort((a, b) => ts(a.at) - ts(b.at));
}

// ---------- statistics ----------

export interface RespStats {
  currentMode: SupportMode | null;
  daysAtCurrentMode: number | null;
  daysOnVent: number;
  ventEpisodes: number;
  extubationAttempts: number;
  reintubations: number;
  /** Days from birth to the first extubation that held for SUCCESS_WINDOW_DAYS.
   *  Null while it is still too early to say. */
  daysToFirstSuccess: number | null;
  lowestModeReached: SupportMode | null;
  /** Largest hole in the gas record, in days — so the UI can be honest about
   *  what the timeline cannot see. */
  sampleGapDays: number;
}

export function respStats(
  ladder: LadderPoint[],
  events: TimelineEvent[],
  dob: string,
  today: string
): RespStats {
  const now = ts(today.length === 10 ? `${today}T23:59:59Z` : today);
  const birth = ts(`${dob.slice(0, 10)}T00:00:00Z`);

  const currentMode = ladder.length ? ladder[ladder.length - 1].mode : null;

  // how long she has been on the current rung
  let daysAtCurrentMode: number | null = null;
  if (currentMode) {
    let since = ladder[ladder.length - 1].at;
    for (let i = ladder.length - 1; i > 0; i--) {
      if (ladder[i - 1].mode !== currentMode) break;
      since = ladder[i - 1].at;
    }
    daysAtCurrentMode = Math.max(0, Math.floor((now - ts(since)) / DAY_MS));
  }

  // ventilator days: each sample's mode holds until the next sample
  let ventMs = 0;
  let sampleGapMs = 0;
  for (let i = 0; i < ladder.length; i++) {
    const start = ts(ladder[i].at);
    const end = i + 1 < ladder.length ? ts(ladder[i + 1].at) : now;
    const span = Math.max(0, end - start);
    if (i + 1 < ladder.length) sampleGapMs = Math.max(sampleGapMs, span);
    if (ladder[i].mode === "vent") ventMs += span;
  }

  const ventEpisodes = events.filter((e) => e.kind === "intubation" || e.kind === "reintubation").length;
  const extubations = events.filter((e) => e.kind === "extubation");
  const reintubations = events.filter((e) => e.kind === "reintubation");

  // the first extubation with no return to the ventilator inside the window
  let daysToFirstSuccess: number | null = null;
  for (const ex of extubations) {
    const back = reintubations.find((r) => ts(r.at) > ts(ex.at));
    const held = back
      ? ts(back.at) - ts(ex.at) > SUCCESS_WINDOW_DAYS * DAY_MS
      : now - ts(ex.at) >= SUCCESS_WINDOW_DAYS * DAY_MS;
    if (held) {
      // completed days since birth, so "21" means she'd lived 21 full days —
      // not rounded up by an afternoon
      daysToFirstSuccess = Math.max(0, Math.floor((ts(ex.at) - birth) / DAY_MS));
      break;
    }
  }

  const lowestModeReached = ladder.length
    ? ladder.reduce((lo, p) => (MODE_RANK[p.mode] < MODE_RANK[lo] ? p.mode : lo), ladder[0].mode)
    : null;

  return {
    currentMode,
    daysAtCurrentMode,
    daysOnVent: Math.round(ventMs / DAY_MS),
    ventEpisodes,
    extubationAttempts: extubations.length,
    reintubations: reintubations.length,
    daysToFirstSuccess,
    lowestModeReached,
    sampleGapDays: Math.round(sampleGapMs / DAY_MS),
  };
}

// ---------- placing it beside the cohort figures ----------

export interface Comparison {
  label: string;
  value: string;
  typical: string;
}

/** Her numbers next to what tends to happen for babies born around the same
 *  gestation. Descriptive only — no "ahead", "behind", "good" or "bad", because
 *  none of those are things a timeline is entitled to say. */
export function compareToCohort(s: RespStats, gestationDays: number | null): Comparison[] {
  const out: Comparison[] = [];
  const veryPreterm = gestationDays !== null && gestationDays < 26 * 7;

  if (s.daysToFirstSuccess !== null) {
    out.push({
      label: "Days to a first extubation that held",
      value: `${s.daysToFirstSuccess}`,
      typical: veryPreterm ? "median around 12 days at 25 weeks" : "varies widely with gestation",
    });
  }
  if (s.ventEpisodes > 0) {
    out.push({
      label: "Times on the ventilator",
      value: `${s.ventEpisodes}`,
      typical: "typically 1–3 cycles between 25 and about 32 weeks corrected",
    });
  }
  if (s.extubationAttempts > 0) {
    out.push({
      label: "Extubation attempts",
      value: `${s.extubationAttempts}`,
      typical: "around half of babies born before 26 weeks need more than one",
    });
  }
  if (s.daysOnVent > 0) {
    out.push({
      label: "Days on the ventilator",
      value: `${s.daysOnVent}`,
      typical: "each reintubation adds roughly 12 more days on average",
    });
  }
  return out;
}

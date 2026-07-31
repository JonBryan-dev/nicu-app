// lib/presence.ts — turn the shift rota into "who's at the hospital", block by
// block, so it lines up exactly with the Rest-tab grid. A day isn't one label:
// it's AM / PM / Eve, each Mum / Dad / Both / Family / Rest. Same wording as
// the rota. An unset block defaults to "both", matching the grid.
import type { ShiftAssignee } from "./types";

export type PresenceKind = ShiftAssignee; // both | mum | dad | family | rest
export type Presence = { kind: PresenceKind; label: string; short: string };

const MAP: Record<PresenceKind, { label: string; short: string }> = {
  both: { label: "Mum & Dad here", short: "Both" },
  mum: { label: "Mum here", short: "Mum" },
  dad: { label: "Dad here", short: "Dad" },
  family: { label: "Family sitting in", short: "Fam" },
  rest: { label: "Parents resting", short: "Off" },
};

export function presenceFor(a: ShiftAssignee): Presence {
  return { kind: a, ...MAP[a] };
}

/** Which rota block a clock time falls in. time = 'HH:MM' or 'HH:MM:SS'. */
export function blockOf(time: string): "AM" | "PM" | "Eve" {
  const h = Number(time.slice(0, 2));
  return h < 12 ? "AM" : h < 17 ? "PM" : "Eve";
}

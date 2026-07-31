"use client";
// ParentPresence — a small "Now · Mum here" banner from the Rest rota, shown on
// every tab so anyone (family included) sees who's at the hospital right now.
// Reads the block (AM/PM/Eve) the current time falls in, so it lines up with
// the rota grid. Silent until the week's rota is set, so it never over-claims.
import { useCallback, useEffect, useState } from "react";
import { useFamily } from "@/components/FamilyProvider";
import { useRealtime } from "@/lib/useRealtime";
import { todayKey, isoWeekKey, dayName } from "@/lib/dates";
import { presenceFor, blockOf, type Presence } from "@/lib/presence";
import { type ShiftAssignee, type ShiftBlock } from "@/lib/types";

function londonHHMM(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

export default function ParentPresence() {
  const { supabase, family } = useFamily();
  const [now, setNow] = useState<Presence | null>(null);

  const load = useCallback(async () => {
    const wk = isoWeekKey(todayKey());
    const { data } = await supabase
      .from("shift_blocks")
      .select("day_name, block_name, assignee")
      .eq("family_id", family.id)
      .eq("week_key", wk);
    const rows = (data as ShiftBlock[]) ?? [];
    if (!rows.length) {
      setNow(null);
      return;
    }
    const map: Record<string, ShiftAssignee> = {};
    for (const r of rows) map[`${r.day_name}-${r.block_name}`] = r.assignee;
    const key = `${dayName(todayKey())}-${blockOf(londonHHMM())}`;
    setNow(presenceFor(map[key] ?? "both"));
  }, [supabase, family.id]);

  useEffect(() => {
    load();
  }, [load]);
  useRealtime(supabase, "shift_blocks", family.id, load);

  if (!now) return null;
  return (
    <div className={`presence presence-${now.kind}`} role="status">
      <span className="presence-dot" aria-hidden="true" />
      <span>Now · {now.label}</span>
    </div>
  );
}

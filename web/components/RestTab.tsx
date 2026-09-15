"use client";
// Rest — weekly shift pattern grid (parents tap to cycle), wellbeing today
// (mum/dad lists, combined progress), respite this week.
import { useCallback, useEffect, useState } from "react";
import { useFamily } from "@/components/FamilyProvider";
import { useRealtime } from "@/lib/useRealtime";
import { todayKey, isoWeekKey } from "@/lib/dates";
import { ensurePeriodItems } from "@/lib/ensureItems";
import { ProgressBar, TickList } from "@/components/Checklist";
import { DEFAULT_BLOCK_HOURS, type BlockHours, type BlockName } from "@/lib/cares";
import {
  DAYS,
  BLOCKS,
  SHIFT_CYCLE,
  type ChecklistItem,
  type ShiftAssignee,
  type ShiftBlock,
} from "@/lib/types";

const STATE_LABEL: Record<ShiftAssignee, string> = {
  both: "Both",
  mum: "Mum",
  dad: "Dad",
  family: "Fam",
  rest: "—",
};

export default function RestTab() {
  const { supabase, profile, family, isParent } = useFamily();
  const dayKey = todayKey();
  const weekKey = isoWeekKey(dayKey);

  const [shifts, setShifts] = useState<Record<string, ShiftAssignee>>({});
  const [respite, setRespite] = useState<ChecklistItem[]>([]);
  const [patternMsg, setPatternMsg] = useState("");
  const [hours, setHours] = useState<BlockHours>(DEFAULT_BLOCK_HOURS);
  const [showHours, setShowHours] = useState(false);

  const loadShifts = useCallback(async () => {
    const { data } = await supabase
      .from("shift_blocks")
      .select("*")
      .eq("family_id", family.id)
      .eq("week_key", weekKey);
    const map: Record<string, ShiftAssignee> = {};
    for (const b of (data as ShiftBlock[]) ?? []) {
      map[`${b.day_name}-${b.block_name}`] = b.assignee;
    }
    setShifts(map);

    // reconcile: every "family" block this week has exactly one support job,
    // and linked jobs whose block moved off "family" are cleaned up
    if (isParent) {
      const { data: linked } = await supabase
        .from("support_tasks")
        .select("id, shift_day, shift_block")
        .eq("family_id", family.id)
        .eq("shift_week", weekKey);
      const jobs = (linked as { id: string; shift_day: string; shift_block: string }[]) ?? [];
      const blockLabel: Record<string, string> = { AM: "morning", PM: "afternoon", Eve: "evening" };
      const first = family.baby_name.split(" ")[0];
      for (const [key, assignee] of Object.entries(map)) {
        const [day, block] = key.split("-");
        const job = jobs.find((j) => j.shift_day === day && j.shift_block === block);
        if (assignee === "family" && !job) {
          // duplicate inserts from a second phone are blocked by the unique index
          await supabase.from("support_tasks").insert({
            family_id: family.id,
            task_text: `Sit with ${first} — ${day} ${blockLabel[block] ?? block}`,
            created_by: profile.id,
            at_hospital: true,
            shift_week: weekKey,
            shift_day: day,
            shift_block: block,
          });
        } else if (assignee !== "family" && job) {
          await supabase.from("support_tasks").delete().eq("id", job.id);
        }
      }
    }
  }, [supabase, family.id, isParent, profile.id, weekKey]);

  // strict block hours (care_settings, migration 037) — outside them the nurses have her
  const loadHours = useCallback(async () => {
    const { data } = await supabase
      .from("care_settings")
      .select("am_from, am_to, pm_from, pm_to, eve_from, eve_to")
      .eq("family_id", family.id)
      .maybeSingle();
    const r = data as Record<string, string | null> | null;
    if (!r) return;
    const h = (k: string, d: string) => (r[k] ? String(r[k]).slice(0, 5) : d);
    setHours({
      AM: [h("am_from", DEFAULT_BLOCK_HOURS.AM[0]), h("am_to", DEFAULT_BLOCK_HOURS.AM[1])],
      PM: [h("pm_from", DEFAULT_BLOCK_HOURS.PM[0]), h("pm_to", DEFAULT_BLOCK_HOURS.PM[1])],
      Eve: [h("eve_from", DEFAULT_BLOCK_HOURS.Eve[0]), h("eve_to", DEFAULT_BLOCK_HOURS.Eve[1])],
    });
  }, [supabase, family.id]);
  useEffect(() => {
    loadHours();
  }, [loadHours]);
  useRealtime(supabase, "care_settings", family.id, loadHours);

  async function saveHours(block: BlockName, which: 0 | 1, value: string) {
    if (!value) return;
    const next: BlockHours = { ...hours, [block]: [...hours[block]] as [string, string] };
    next[block][which] = value;
    setHours(next);
    const { error } = await supabase.from("care_settings").upsert({
      family_id: family.id,
      am_from: next.AM[0], am_to: next.AM[1],
      pm_from: next.PM[0], pm_to: next.PM[1],
      eve_from: next.Eve[0], eve_to: next.Eve[1],
      updated_at: new Date().toISOString(),
    });
    if (error) setPatternMsg("Hours didn't save: " + error.message);
  }

  const loadItems = useCallback(async () => {
    if (!isParent) return; // respite is mum & dad's private space
    const { data } = await supabase
      .from("checklist_items")
      .select("*")
      .eq("family_id", family.id)
      .eq("list_type", "respite")
      .eq("scope_key", weekKey)
      .order("sort_order")
      .order("created_at");
    setRespite((data as ChecklistItem[]) ?? []);
  }, [supabase, family.id, isParent, weekKey]);

  useEffect(() => {
    (async () => {
      if (isParent) {
        await ensurePeriodItems(supabase, family.id, isParent, "respite", weekKey);
        loadItems();
        // a week with no blocks yet starts from the family's usual pattern
        // (shift_defaults, migration 034); harmless if that's not run yet
        await supabase.rpc("ensure_shift_week", { p_week_key: weekKey });
      }
      loadShifts();
    })();
  }, [supabase, family.id, isParent, dayKey, weekKey, loadItems, loadShifts]);

  // "this is our set schedule" — keep it, or put a fiddled week back to it
  async function savePattern() {
    setPatternMsg("");
    const { error } = await supabase.rpc("save_shift_defaults", { p_week_key: weekKey });
    setPatternMsg(error ? "Couldn't save the pattern: " + error.message : "Saved — new weeks start from this pattern.");
  }
  async function resetPattern() {
    setPatternMsg("");
    if (!window.confirm("Put this week back to your usual pattern?")) return;
    const { error } = await supabase.rpc("reset_shift_week", { p_week_key: weekKey });
    setPatternMsg(error ? "Couldn't reset: " + error.message : "Back to your usual week.");
    loadShifts();
  }

  useRealtime(supabase, "shift_blocks", family.id, loadShifts);
  useRealtime(supabase, "checklist_items", family.id, loadItems);

  async function cycleShift(day: string, block: string) {
    if (!isParent) return;
    const cur = shifts[`${day}-${block}`] ?? "both";
    const next = SHIFT_CYCLE[(SHIFT_CYCLE.indexOf(cur) + 1) % SHIFT_CYCLE.length];
    setShifts((s) => ({ ...s, [`${day}-${block}`]: next }));
    await supabase.from("shift_blocks").upsert(
      {
        family_id: family.id,
        week_key: weekKey,
        day_name: day,
        block_name: block,
        assignee: next,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "family_id,week_key,day_name,block_name" }
    );

    // a "family" block IS a support job — keep the Support list in sync
    const blockLabel = { AM: "morning", PM: "afternoon", Eve: "evening" }[block] ?? block;
    const first = family.baby_name.split(" ")[0];
    if (next === "family") {
      await supabase.from("support_tasks").insert({
        family_id: family.id,
        task_text: `Sit with ${first} — ${day} ${blockLabel}`,
        created_by: profile.id,
        at_hospital: true,
        shift_week: weekKey,
        shift_day: day,
        shift_block: block,
      });
    } else if (cur === "family") {
      await supabase
        .from("support_tasks")
        .delete()
        .match({ family_id: family.id, shift_week: weekKey, shift_day: day, shift_block: block });
    }
    loadShifts();
  }

  async function toggle(item: ChecklistItem) {
    await supabase
      .from("checklist_items")
      .update({ done: !item.done })
      .eq("id", item.id);
    loadItems();
  }

  if (!isParent) {
    return (
      <section>
        <div className="card">
          <div className="empty">This one&apos;s just for mum &amp; dad.</div>
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="card">
        <h2>This week&apos;s shift pattern</h2>
        <p className="note">
          {isParent
            ? "Each week starts from your usual pattern — tap a block to change who's on this week. You don't both need to be bedside all day; the unit will call if anything changes."
            : "Who's with her, block by block, this week."}
        </p>
        <table className="shift" aria-label="Weekly shift pattern">
          <thead>
            <tr>
              <th />
              {DAYS.map((d) => (
                <th key={d}>{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {BLOCKS.map((b) => (
              <tr key={b}>
                <th style={{ textAlign: "left" }}>
                  {b}
                  <small>{hours[b][0].slice(0, 5)}–{hours[b][1].slice(0, 5)}</small>
                </th>
                {DAYS.map((d) => {
                  const st = shifts[`${d}-${b}`] ?? "both";
                  return (
                    <td key={d}>
                      <button
                        className={`chip ${st}`}
                        disabled={!isParent}
                        onClick={() => cycleShift(d, b)}
                        aria-label={`${d} ${b}: ${STATE_LABEL[st]}`}
                      >
                        {STATE_LABEL[st]}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="legend">
          <span>
            <i style={{ background: "var(--rose-deep)" }} />
            Both
          </span>
          <span>
            <i style={{ background: "var(--rose)" }} />
            Mum
          </span>
          <span>
            <i style={{ background: "var(--sky)" }} />
            Dad
          </span>
          <span>
            <i style={{ background: "var(--sage)" }} />
            Family sit-in
          </span>
          <span>
            <i style={{ background: "var(--mist)" }} />
            Rest / off
          </span>
        </div>
        {isParent && (
          <div className="row rowwrap" style={{ marginTop: 10 }}>
            <button type="button" className="ghost" onClick={savePattern}>
              Make this our usual week
            </button>
            <button type="button" className="tiny" style={{ flex: "0 0 auto" }} onClick={resetPattern}>
              back to usual
            </button>
          </div>
        )}
        {patternMsg && <p className="muted" style={{ marginTop: 6 }}>{patternMsg}</p>}
        {isParent && (
          <div style={{ marginTop: 10 }}>
            {!showHours ? (
              <button type="button" className="tiny" onClick={() => setShowHours(true)}>
                shift hours
              </button>
            ) : (
              <>
                <p className="note">
                  When each block starts and ends. Outside these — or on a Rest / Family block — the nurses have her, and no feed or cares is counted against you.
                </p>
                <div className="shifthours">
                  {BLOCKS.map((b) => (
                    <div key={b} style={{ display: "contents" }}>
                      <label>{b}</label>
                      <input type="time" value={hours[b][0]} onChange={(e) => saveHours(b, 0, e.target.value)} aria-label={`${b} starts`} />
                      <input type="time" value={hours[b][1]} onChange={(e) => saveHours(b, 1, e.target.value)} aria-label={`${b} ends`} />
                    </div>
                  ))}
                </div>
                <button type="button" className="tiny" style={{ marginTop: 8 }} onClick={() => setShowHours(false)}>
                  done
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {isParent && (
        <div className="card">
          <h2>Respite this week</h2>
          <p className="note">
            Aim to tick at least three. The guilt of leaving is normal — go
            anyway.
          </p>
          <ProgressBar items={respite} />
          <TickList items={respite} canEdit={isParent} onToggle={toggle} />
        </div>
      )}
    </section>
  );
}

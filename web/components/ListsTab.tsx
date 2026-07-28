"use client";
// Lists — "Today" (daily, Europe/London date key) and "This week" (ISO week key).
// Calls ensure_period_items on load so fresh periods materialise from templates.
import { useCallback, useEffect, useState } from "react";
import { useFamily } from "@/components/FamilyProvider";
import { useRealtime } from "@/lib/useRealtime";
import { todayKey, isoWeekKey, fmtDate } from "@/lib/dates";
import { ensurePeriodItems } from "@/lib/ensureItems";
import { ProgressBar, TickList } from "@/components/Checklist";
import type { ChecklistItem, ListType } from "@/lib/types";

export default function ListsTab() {
  const { supabase, family, isParent } = useFamily();
  const dayKey = todayKey();
  const weekKey = isoWeekKey(dayKey);
  const [daily, setDaily] = useState<ChecklistItem[]>([]);
  const [weekly, setWeekly] = useState<ChecklistItem[]>([]);
  const [newDaily, setNewDaily] = useState("");
  const [newWeekly, setNewWeekly] = useState("");
  const [dailyRoutine, setDailyRoutine] = useState(false);
  const [weeklyRoutine, setWeeklyRoutine] = useState(false);

  const load = useCallback(async () => {
    if (!isParent) return; // Lists is mum & dad's private space
    const { data } = await supabase
      .from("checklist_items")
      .select("*")
      .eq("family_id", family.id)
      .in("list_type", ["daily", "weekly"])
      .in("scope_key", [dayKey, weekKey])
      .eq("skipped", false)
      .order("sort_order")
      .order("created_at");
    const items = (data as ChecklistItem[]) ?? [];
    setDaily(items.filter((i) => i.list_type === "daily" && i.scope_key === dayKey));
    setWeekly(items.filter((i) => i.list_type === "weekly" && i.scope_key === weekKey));
  }, [supabase, family.id, isParent, dayKey, weekKey]);

  useEffect(() => {
    (async () => {
      await ensurePeriodItems(supabase, family.id, isParent, "daily", dayKey);
      await ensurePeriodItems(supabase, family.id, isParent, "weekly", weekKey);
      load();
    })();
  }, [supabase, family.id, isParent, dayKey, weekKey, load]);

  useRealtime(supabase, "checklist_items", family.id, load);

  async function toggle(item: ChecklistItem) {
    await supabase
      .from("checklist_items")
      .update({ done: !item.done })
      .eq("id", item.id);
    load();
  }

  // hide a routine item for this period only — the row stays, so it can't be
  // resurrected by regeneration, and it returns fresh next period
  async function skipToday(item: ChecklistItem) {
    await supabase
      .from("checklist_items")
      .update({ skipped: true })
      .eq("id", item.id);
    load();
  }

  // one-off item: delete it. Routine item: delete its TEMPLATE, which
  // cascades away its instances — gone from every day going forward.
  async function removeForever(item: ChecklistItem) {
    if (item.template_id) {
      await supabase
        .from("checklist_templates")
        .delete()
        .eq("id", item.template_id);
    } else {
      await supabase.from("checklist_items").delete().eq("id", item.id);
    }
    load();
  }

  async function add(
    listType: ListType,
    text: string,
    scopeKey: string,
    routine: boolean
  ) {
    const t = text.trim();
    if (!t) return;
    if (routine) {
      // add to the routine: create a template, then materialise today's copy
      const { data: tpl } = await supabase
        .from("checklist_templates")
        .insert({ family_id: family.id, list_type: listType, item_text: t, sort_order: 50 })
        .select()
        .single();
      if (tpl) {
        await supabase.from("checklist_items").insert({
          family_id: family.id,
          list_type: listType,
          scope_key: scopeKey,
          template_id: tpl.id,
          item_text: t,
          sort_order: 50,
        });
      }
    } else {
      await supabase.from("checklist_items").insert({
        family_id: family.id,
        list_type: listType,
        scope_key: scopeKey,
        item_text: t,
        sort_order: 100,
      });
    }
    load();
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
        <h2>
          Today <span className="muted">· {fmtDate(dayKey)}</span>
        </h2>
        <ProgressBar items={daily} />
        <TickList
          items={daily}
          canEdit={isParent}
          onToggle={toggle}
          onSkipToday={skipToday}
          onRemoveForever={removeForever}
        />
        {isParent && (
          <form
            style={{ marginTop: 10 }}
            onSubmit={(e) => {
              e.preventDefault();
              add("daily", newDaily, dayKey, dailyRoutine);
              setNewDaily("");
              setDailyRoutine(false);
            }}
          >
            <div className="row">
              <input
                type="text"
                value={newDaily}
                onChange={(e) => setNewDaily(e.target.value)}
                placeholder="Add something for today…"
                aria-label="New daily item"
              />
              <button className="ghost" style={{ flex: "0 0 auto" }} type="submit">
                Add
              </button>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, cursor: "pointer", fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={dailyRoutine}
                onChange={(e) => setDailyRoutine(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: "var(--sage)" }}
              />
              <span className="muted">add to the daily routine (appears every day)</span>
            </label>
          </form>
        )}
        <p className="muted" style={{ marginTop: 8 }}>
          Resets fresh each morning. ✕ on a routine item asks: just today, or every day.
        </p>
      </div>

      <div className="card">
        <h2>This week</h2>
        <ProgressBar items={weekly} />
        <TickList
          items={weekly}
          canEdit={isParent}
          onToggle={toggle}
          onSkipToday={skipToday}
          onRemoveForever={removeForever}
        />
        {isParent && (
          <form
            style={{ marginTop: 10 }}
            onSubmit={(e) => {
              e.preventDefault();
              add("weekly", newWeekly, weekKey, weeklyRoutine);
              setNewWeekly("");
              setWeeklyRoutine(false);
            }}
          >
            <div className="row">
              <input
                type="text"
                value={newWeekly}
                onChange={(e) => setNewWeekly(e.target.value)}
                placeholder="Add something for this week…"
                aria-label="New weekly item"
              />
              <button className="ghost" style={{ flex: "0 0 auto" }} type="submit">
                Add
              </button>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, cursor: "pointer", fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={weeklyRoutine}
                onChange={(e) => setWeeklyRoutine(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: "var(--sage)" }}
              />
              <span className="muted">add to the weekly routine (appears every week)</span>
            </label>
          </form>
        )}
      </div>
    </section>
  );
}

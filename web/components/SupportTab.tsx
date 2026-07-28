"use client";
// Support — jobs family can claim. Family: claim/un-claim their own.
// Parents: add (optionally "at the hospital"), delete, Nudge.
// Claiming a hospital job prompts the claimer to book a free visiting slot,
// linking the job to the visit (and both flow into the shared calendar).
import { useCallback, useEffect, useState } from "react";
import { useFamily } from "@/components/FamilyProvider";
import { useRealtime } from "@/lib/useRealtime";
import { todayKey, fmtDate, fmtTime } from "@/lib/dates";
import type { SupportTask, VisitSlot } from "@/lib/types";

export default function SupportTab() {
  const { supabase, profile, family, isParent } = useFamily();
  const [tasks, setTasks] = useState<SupportTask[] | null>(null);
  const [slots, setSlots] = useState<VisitSlot[]>([]);
  const [newTask, setNewTask] = useState("");
  const [newAtHospital, setNewAtHospital] = useState(false);
  const [linking, setLinking] = useState<string | null>(null); // task id awaiting slot pick

  const load = useCallback(async () => {
    const [t, s] = await Promise.all([
      supabase
        .from("support_tasks")
        .select("*, claimer:profiles!support_tasks_claimed_by_fkey(id, display_name)")
        .eq("family_id", family.id)
        .order("created_at"),
      supabase
        .from("visit_slots")
        .select("*")
        .eq("family_id", family.id)
        .gte("slot_date", todayKey())
        .order("slot_date")
        .order("start_time"),
    ]);
    setTasks((t.data as SupportTask[]) ?? []);
    setSlots((s.data as VisitSlot[]) ?? []);
  }, [supabase, family.id]);

  useEffect(() => {
    load();
  }, [load]);
  useRealtime(supabase, "support_tasks", family.id, load);
  useRealtime(supabase, "visit_slots", family.id, load);

  const freeSlots = slots.filter((s) => !s.booked_by);
  const slotById = (id?: string | null) => slots.find((s) => s.id === id);

  async function toggleClaim(task: SupportTask) {
    const mine = task.claimed_by === profile.id;
    if (task.claimed_by && !mine) return;
    const { error } = await supabase
      .from("support_tasks")
      .update({ claimed_by: mine ? null : profile.id, slot_id: mine ? null : task.slot_id })
      .eq("id", task.id);
    if (error) {
      alert(error.message);
      return;
    }
    if (!mine && task.at_hospital && freeSlots.length) setLinking(task.id);
    if (mine) setLinking(null);
    load();
  }

  async function linkSlot(task: SupportTask, slot: VisitSlot) {
    // book the slot and pin it to the job
    const { error } = await supabase
      .from("visit_slots")
      .update({ booked_by: profile.id })
      .eq("id", slot.id);
    if (error) {
      alert(error.message);
      return;
    }
    await supabase.from("support_tasks").update({ slot_id: slot.id }).eq("id", task.id);
    setLinking(null);
    load();
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const t = newTask.trim();
    if (!t) return;
    await supabase.from("support_tasks").insert({
      family_id: family.id,
      task_text: t,
      created_by: profile.id,
      at_hospital: newAtHospital,
    });
    setNewTask("");
    setNewAtHospital(false);
    load();
  }

  async function remove(task: SupportTask) {
    await supabase.from("support_tasks").delete().eq("id", task.id);
    load();
  }

  async function nudge(task: SupportTask) {
    await supabase.rpc("nudge_task", { p_task_id: task.id });
    const msg = `Hi — could anyone cover this for us this week?\n\n"${task.task_text}"\n\nIf you can, open ${family.baby_name}'s app and tap "I'll do this" so we know it's sorted. Thank you 💛`;
    window.open("https://wa.me/?text=" + encodeURIComponent(msg), "_blank");
  }

  return (
    <section>
      <div className="card">
        <h2>How family can help this week</h2>
        <p className="note">
          {isParent ? (
            <>Tap <b>Nudge</b> to chase cover for a job via WhatsApp.</>
          ) : (
            <>Tap <b>I&apos;ll do this</b> to claim a job — it means more than you know.</>
          )}
        </p>
        {tasks === null ? null : tasks.length === 0 ? (
          <div className="empty">No jobs listed yet.</div>
        ) : (
          tasks.map((t) => {
            const mine = t.claimed_by === profile.id;
            const linked = slotById(t.slot_id);
            return (
              <div key={t.id}>
                <div className="task">
                  <div className="info">
                    {t.task_text}
                    {t.at_hospital && <span className="badge" style={{ marginLeft: 6 }}>at the hospital</span>}
                    {t.claimed_by && (
                      <div className="who">
                        ✓ {mine ? "You have" : `${t.claimer?.display_name ?? "Someone"} has`} this covered
                        {linked && <> · 🕐 {fmtDate(linked.slot_date)} {fmtTime(linked.start_time)}–{fmtTime(linked.end_time)}</>}
                      </div>
                    )}
                  </div>
                  {(!t.claimed_by || mine) && (
                    <button className="ghost" onClick={() => toggleClaim(t)}>
                      {mine ? "Un-claim" : "I'll do this"}
                    </button>
                  )}
                  {isParent && !t.claimed_by && (
                    <button className="ghost" onClick={() => nudge(t)} title="Ask family to cover this">
                      Nudge
                    </button>
                  )}
                  {isParent && (
                    <button className="tiny" onClick={() => remove(t)} aria-label={`Delete job: ${t.task_text}`}>
                      ✕
                    </button>
                  )}
                </div>
                {linking === t.id && mine && !t.slot_id && (
                  <div className="linkslots">
                    <span className="muted">This one happens at the hospital — book a visit for it:</span>
                    {freeSlots.map((s) => (
                      <button key={s.id} className="ghost" onClick={() => linkSlot(t, s)}>
                        {fmtDate(s.slot_date)} · {fmtTime(s.start_time)}–{fmtTime(s.end_time)}
                      </button>
                    ))}
                    <button className="tiny" onClick={() => setLinking(null)}>not now</button>
                  </div>
                )}
              </div>
            );
          })
        )}
        {isParent && (
          <form style={{ marginTop: 10 }} onSubmit={add}>
            <div className="row">
              <input
                type="text"
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                placeholder="Add a job family could do…"
                aria-label="New support job"
              />
              <button className="ghost" style={{ flex: "0 0 auto" }} type="submit">
                Add
              </button>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, cursor: "pointer", fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={newAtHospital}
                onChange={(e) => setNewAtHospital(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: "var(--sage)" }}
              />
              <span className="muted">happens at the hospital (claimer books a visiting slot)</span>
            </label>
          </form>
        )}
      </div>
    </section>
  );
}

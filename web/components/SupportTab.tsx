"use client";
// Support — jobs family can claim. Family: claim/un-claim their own.
// Parents: add, delete, and Nudge (notification to family + WhatsApp share).
import { useCallback, useEffect, useState } from "react";
import { useFamily } from "@/components/FamilyProvider";
import { useRealtime } from "@/lib/useRealtime";
import type { SupportTask } from "@/lib/types";

export default function SupportTab() {
  const { supabase, profile, family, isParent } = useFamily();
  const [tasks, setTasks] = useState<SupportTask[] | null>(null);
  const [newTask, setNewTask] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("support_tasks")
      .select("*, claimer:profiles!support_tasks_claimed_by_fkey(id, display_name)")
      .eq("family_id", family.id)
      .order("created_at");
    setTasks((data as SupportTask[]) ?? []);
  }, [supabase, family.id]);

  useEffect(() => {
    load();
  }, [load]);
  useRealtime(supabase, "support_tasks", family.id, load);

  async function toggleClaim(task: SupportTask) {
    const mine = task.claimed_by === profile.id;
    if (task.claimed_by && !mine) return;
    const { error } = await supabase
      .from("support_tasks")
      .update({ claimed_by: mine ? null : profile.id })
      .eq("id", task.id);
    if (error) alert(error.message);
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
    });
    setNewTask("");
    load();
  }

  async function remove(task: SupportTask) {
    await supabase.from("support_tasks").delete().eq("id", task.id);
    load();
  }

  async function nudge(task: SupportTask) {
    // (a) in-app notification to family role
    await supabase.rpc("nudge_task", { p_task_id: task.id });
    // (b) WhatsApp share fallback with prefilled text
    const msg = `Hi — could anyone cover this for us this week?\n\n"${task.task_text}"\n\nIf you can, open ${family.baby_name}'s app and tap "I'll do this" so we know it's sorted. Thank you 💛`;
    window.open("https://wa.me/?text=" + encodeURIComponent(msg), "_blank");
  }

  return (
    <section>
      <div className="card">
        <h2>How family can help this week</h2>
        <p className="note">
          {isParent ? (
            <>
              Tap <b>Nudge</b> to chase cover for a job via WhatsApp.
            </>
          ) : (
            <>
              Tap <b>I&apos;ll do this</b> to claim a job — it means more than
              you know.
            </>
          )}
        </p>
        {tasks === null ? null : tasks.length === 0 ? (
          <div className="empty">No jobs listed yet.</div>
        ) : (
          tasks.map((t) => {
            const mine = t.claimed_by === profile.id;
            return (
              <div key={t.id} className="task">
                <div className="info">
                  {t.task_text}
                  {t.claimed_by && (
                    <div className="who">
                      ✓ {mine ? "You have" : `${t.claimer?.display_name ?? "Someone"} has`} this covered
                    </div>
                  )}
                </div>
                {(!t.claimed_by || mine) && (
                  <button className="ghost" onClick={() => toggleClaim(t)}>
                    {mine ? "Un-claim" : "I'll do this"}
                  </button>
                )}
                {isParent && !t.claimed_by && (
                  <button
                    className="ghost"
                    onClick={() => nudge(t)}
                    title="Ask family to cover this"
                  >
                    Nudge
                  </button>
                )}
                {isParent && (
                  <button
                    className="tiny"
                    onClick={() => remove(t)}
                    aria-label={`Delete job: ${t.task_text}`}
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })
        )}
        {isParent && (
          <form className="row" style={{ marginTop: 10 }} onSubmit={add}>
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
          </form>
        )}
      </div>
    </section>
  );
}

"use client";
// Updates — feed on a dotted thread. Parents post (optionally as milestone)
// and can delete any post. Push to family is handled by DB triggers.
import { useCallback, useEffect, useState } from "react";
import { useFamily } from "@/components/FamilyProvider";
import { useRealtime } from "@/lib/useRealtime";
import { fmtStamp } from "@/lib/dates";
import type { Update } from "@/lib/types";

export default function UpdatesTab() {
  const { supabase, profile, family, isParent } = useFamily();
  const [updates, setUpdates] = useState<Update[] | null>(null);
  const [body, setBody] = useState("");
  const [milestone, setMilestone] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("updates")
      .select("*, author:profiles!updates_author_id_fkey(id, display_name)")
      .eq("family_id", family.id)
      .order("created_at", { ascending: false });
    setUpdates((data as Update[]) ?? []);
  }, [supabase, family.id]);

  useEffect(() => {
    load();
  }, [load]);
  useRealtime(supabase, "updates", family.id, load);

  async function post(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    const { error } = await supabase.from("updates").insert({
      family_id: family.id,
      author_id: profile.id,
      body: text,
      is_milestone: milestone,
    });
    setBusy(false);
    if (!error) {
      setBody("");
      setMilestone(false);
      load();
    }
  }

  async function remove(id: string) {
    await supabase.from("updates").delete().eq("id", id);
    load();
  }

  return (
    <section>
      {isParent && (
        <form className="card" onSubmit={post}>
          <h2>Share an update</h2>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Weight today, how she's doing, a little win…"
            aria-label="Update text"
          />
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 10,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={milestone}
              onChange={(e) => setMilestone(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: "var(--rose-deep)" }}
            />
            <span
              style={{
                fontWeight: 700,
                fontSize: ".85rem",
                color: "var(--rose-deep)",
              }}
            >
              Mark as a milestone ✦
            </span>
          </label>
          <div style={{ marginTop: 12 }}>
            <button className="primary" type="submit" disabled={busy}>
              Post update
            </button>
          </div>
        </form>
      )}

      <div className="thread">
        {updates === null ? null : updates.length === 0 ? (
          <div className="empty">
            No updates yet — the first post starts her story.
          </div>
        ) : (
          updates.map((u) => (
            <div key={u.id} className={`post ${u.is_milestone ? "milestone" : ""}`}>
              {u.is_milestone && (
                <>
                  <span className="flag">✦ Milestone</span>
                  <br />
                </>
              )}
              <div className="meta">
                {u.author?.display_name ?? "Someone"} · {fmtStamp(u.created_at)}
              </div>
              <p>{u.body}</p>
              {isParent && (
                <button className="tiny" onClick={() => remove(u.id)}>
                  remove
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}

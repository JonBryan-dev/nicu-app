"use client";
// Updates — dotted-thread feed with photos, milestone "firsts", and guided
// diary prompts. Parents compose; family reads. Push is handled by DB triggers.
import { useCallback, useEffect, useRef, useState } from "react";
import { useFamily } from "@/components/FamilyProvider";
import { useRealtime } from "@/lib/useRealtime";
import { fmtStamp, todayKey } from "@/lib/dates";
import { uploadPhotos, signedUrlMap, deletePhotos } from "@/lib/photos";
import GrowthCard from "@/components/GrowthCard";
import { MILESTONE_FIRSTS, type Update } from "@/lib/types";

type Mode = "free" | "guided";

const REACTION_SET = ["💛", "🥹", "🎉", "💪"] as const;
const MAX_FILE_MB = 50; // Supabase storage per-object default

type CommentRow = {
  id: string;
  update_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
  author?: { display_name: string } | null;
};
type ReactionRow = { update_id: string; profile_id: string; emoji: string };

const isVideo = (path: string) => /\.(mp4|mov|m4v|webm|ogv)$/i.test(path);

export default function UpdatesTab() {
  const { supabase, profile, family, isParent } = useFamily();
  const isTeam = profile.role === "team";
  const canPost = isParent || isTeam;
  const [updates, setUpdates] = useState<Update[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [comments, setComments] = useState<Record<string, CommentRow[]>>({});
  const [reactions, setReactions] = useState<Record<string, ReactionRow[]>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const [mode, setMode] = useState<Mode>("free");
  const [body, setBody] = useState("");
  const [milestone, setMilestone] = useState(false);
  const [label, setLabel] = useState<string | null>(null);
  // guided fields
  const [gWeight, setGWeight] = useState("");
  const [gFeeds, setGFeeds] = useState("");
  const [gHighlight, setGHighlight] = useState("");
  const [gFeeling, setGFeeling] = useState("");
  // photos
  const [files, setFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const textRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    const [u, c, r] = await Promise.all([
      supabase
        .from("updates")
        .select("*, author:profiles!updates_author_id_fkey(id, display_name)")
        .eq("family_id", family.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("update_comments")
        .select("*, author:profiles!update_comments_author_id_fkey(display_name)")
        .eq("family_id", family.id)
        .order("created_at"),
      supabase
        .from("update_reactions")
        .select("update_id, profile_id, emoji")
        .eq("family_id", family.id),
    ]);
    const rows = (u.data as Update[]) ?? [];
    setUpdates(rows);
    const byUpdate: Record<string, CommentRow[]> = {};
    for (const row of (c.data as CommentRow[]) ?? []) {
      (byUpdate[row.update_id] ??= []).push(row);
    }
    setComments(byUpdate);
    const rByUpdate: Record<string, ReactionRow[]> = {};
    for (const row of (r.data as ReactionRow[]) ?? []) {
      (rByUpdate[row.update_id] ??= []).push(row);
    }
    setReactions(rByUpdate);
    const paths = rows.flatMap((up) => up.image_paths ?? []);
    if (paths.length) setUrls(await signedUrlMap(supabase, paths));
  }, [supabase, family.id]);

  useEffect(() => {
    load();
  }, [load]);
  useRealtime(supabase, "updates", family.id, load);
  useRealtime(supabase, "update_comments", family.id, load);
  useRealtime(supabase, "update_reactions", family.id, load);

  async function toggleReaction(updateId: string, emoji: string) {
    const mine = (reactions[updateId] ?? []).some(
      (r) => r.profile_id === profile.id && r.emoji === emoji
    );
    if (mine) {
      await supabase
        .from("update_reactions")
        .delete()
        .match({ update_id: updateId, profile_id: profile.id, emoji });
    } else {
      await supabase.from("update_reactions").insert({
        family_id: family.id,
        update_id: updateId,
        profile_id: profile.id,
        emoji,
      });
    }
    load();
  }

  async function addComment(updateId: string) {
    const body = (drafts[updateId] ?? "").trim();
    if (!body) return;
    const { error } = await supabase.from("update_comments").insert({
      family_id: family.id,
      update_id: updateId,
      author_id: profile.id,
      body,
    });
    if (!error) setDrafts((d) => ({ ...d, [updateId]: "" }));
    load();
  }

  async function deleteComment(id: string) {
    await supabase.from("update_comments").delete().eq("id", id);
    load();
  }

  function tapFirst(first: string) {
    setMode("free");
    setMilestone(true);
    setLabel(first);
    setBody((b) => (b.trim() ? b : first));
    textRef.current?.focus();
  }

  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const all = Array.from(e.target.files ?? []).filter(
      (f) => f.type.startsWith("image/") || f.type.startsWith("video/")
    );
    const tooBig = all.filter((f) => f.size > MAX_FILE_MB * 1024 * 1024);
    if (tooBig.length) {
      setErr(
        `Videos need to be under ${MAX_FILE_MB}MB — trim it in Photos first and try again.`
      );
    }
    const picked = all.filter((f) => f.size <= MAX_FILE_MB * 1024 * 1024);
    setFiles((prev) => [...prev, ...picked].slice(0, 6));
    if (fileRef.current) fileRef.current.value = "";
  }

  function buildGuidedBody() {
    const parts: string[] = [];
    if (gWeight.trim()) parts.push(`Weight: ${gWeight.trim()} kg`);
    if (gFeeds.trim()) parts.push(`Feeds: ${gFeeds.trim()}`);
    if (gHighlight.trim()) parts.push(`Highlight: ${gHighlight.trim()}`);
    if (gFeeling.trim()) parts.push(`Feeling: ${gFeeling.trim()}`);
    return parts.join("\n");
  }

  function reset() {
    setBody("");
    setMilestone(false);
    setLabel(null);
    setGWeight("");
    setGFeeds("");
    setGHighlight("");
    setGFeeling("");
    setFiles([]);
    setMode("free");
  }

  async function post(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const text = mode === "guided" ? buildGuidedBody() : body.trim();
    if (!text && files.length === 0) {
      setErr("Add a few words or a photo.");
      return;
    }
    setBusy(true);
    try {
      // weight from guided prompts also feeds the growth chart
      if (mode === "guided" && gWeight.trim()) {
        const grams = Math.round(parseFloat(gWeight) * 1000);
        if (!isNaN(grams) && grams >= 200 && grams <= 20000) {
          await supabase.from("care_logs").upsert(
            {
              family_id: family.id,
              logged_by: profile.id,
              log_date: todayKey(),
              weight_grams: grams,
              feeds_note: gFeeds.trim() || null,
            },
            { onConflict: "family_id,log_date" }
          );
        }
      }
      const image_paths = files.length
        ? await uploadPhotos(supabase, family.id, files)
        : [];
      const { error } = await supabase.from("updates").insert({
        family_id: family.id,
        author_id: profile.id,
        body: text || "📷",
        is_milestone: milestone,
        milestone_label: label,
        image_paths,
      });
      if (error) throw error;
      reset();
      load();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Something went wrong posting.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(u: Update) {
    if (u.image_paths?.length) await deletePhotos(supabase, u.image_paths);
    await supabase.from("updates").delete().eq("id", u.id);
    load();
  }

  return (
    <section>
      {canPost && (
        <form className="card" onSubmit={post}>
          <h2>Share an update</h2>

          {/* one-tap milestone firsts */}
          <div className="firsts">
            {MILESTONE_FIRSTS.map((f) => (
              <button
                key={f}
                type="button"
                className={`firstchip ${label === f ? "on" : ""}`}
                onClick={() => tapFirst(f)}
              >
                {f}
              </button>
            ))}
          </div>

          {mode === "free" ? (
            <textarea
              ref={textRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Weight today, how she's doing, a little win…"
              aria-label="Update text"
            />
          ) : (
            <div className="guided">
              <div className="row wrap">
                <div>
                  <label htmlFor="g-w">Weight (kg)</label>
                  <input id="g-w" type="text" inputMode="decimal" value={gWeight} onChange={(e) => setGWeight(e.target.value)} placeholder="1.42" />
                </div>
                <div>
                  <label htmlFor="g-f">Feeds</label>
                  <input id="g-f" type="text" value={gFeeds} onChange={(e) => setGFeeds(e.target.value)} placeholder="8 × 35ml" />
                </div>
              </div>
              <label htmlFor="g-h">Today&apos;s highlight</label>
              <input id="g-h" type="text" value={gHighlight} onChange={(e) => setGHighlight(e.target.value)} placeholder="Held her for an hour" />
              <label htmlFor="g-fe">How you&apos;re feeling</label>
              <input id="g-fe" type="text" value={gFeeling} onChange={(e) => setGFeeling(e.target.value)} placeholder="Tired but hopeful" />
            </div>
          )}

          <div className="composer-row">
            {isParent ? (
              <button
                type="button"
                className="tiny"
                onClick={() => setMode(mode === "free" ? "guided" : "free")}
              >
                {mode === "free" ? "Use guided prompts" : "Free write"}
              </button>
            ) : (
              <span />
            )}
            <label className="milestone-toggle">
              <input
                type="checkbox"
                checked={milestone}
                onChange={(e) => {
                  setMilestone(e.target.checked);
                  if (!e.target.checked) setLabel(null);
                }}
              />
              <span>Milestone {label ? `✦ ${label}` : "✦"}</span>
            </label>
          </div>

          {/* photos */}
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={onPickFiles}
            style={{ display: "none" }}
          />
          <div className="composer-row">
            <button type="button" className="ghost" onClick={() => fileRef.current?.click()}>
              📷 Photo / video{files.length ? ` (${files.length})` : ""}
            </button>
            <button className="primary" type="submit" disabled={busy}>
              {busy ? "Posting…" : "Post update"}
            </button>
          </div>
          {files.length > 0 && (
            <div className="thumbs">
              {files.map((f, i) => (
                <div key={i} className="thumb">
                  {f.type.startsWith("video/") ? (
                    <span className="vid" aria-label="Video">🎬</span>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={URL.createObjectURL(f)} alt="" />
                  )}
                  <button
                    type="button"
                    aria-label="Remove attachment"
                    onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          {err && <p className="err">{err}</p>}
        </form>
      )}

      {!isTeam && <GrowthCard />}

      <div className="thread">
        {updates === null ? null : updates.length === 0 ? (
          <div className="empty">No updates yet — the first post starts her story.</div>
        ) : (
          updates.map((u) => (
            <div key={u.id} className={`post ${u.is_milestone ? "milestone" : ""}`}>
              {u.is_milestone && (
                <>
                  <span className="flag">✦ {u.milestone_label ?? "Milestone"}</span>
                  <br />
                </>
              )}
              <div className="meta">
                {u.author?.display_name ?? "Someone"} · {fmtStamp(u.created_at)}
              </div>
              {u.body && u.body !== "📷" && u.body !== u.milestone_label && <p>{u.body}</p>}
              {u.image_paths && u.image_paths.length > 0 && (
                <div className={`photos n${Math.min(u.image_paths.length, 3)}`}>
                  {u.image_paths.map((p) =>
                    urls[p] ? (
                      isVideo(p) ? (
                        <video
                          key={p}
                          src={urls[p]}
                          controls
                          playsInline
                          preload="metadata"
                        />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={p} src={urls[p]} alt="Update photo" loading="lazy" />
                      )
                    ) : (
                      <div key={p} className="photo-skel" />
                    )
                  )}
                </div>
              )}

              {/* reactions — everyone in the space can love a moment */}
              <div className="reactbar">
                {REACTION_SET.map((e) => {
                  const rs = (reactions[u.id] ?? []).filter((r) => r.emoji === e);
                  const mine = rs.some((r) => r.profile_id === profile.id);
                  return (
                    <button
                      key={e}
                      type="button"
                      className={mine ? "on" : ""}
                      onClick={() => toggleReaction(u.id, e)}
                      aria-pressed={mine}
                      aria-label={`React ${e}`}
                    >
                      {e}
                      {rs.length > 0 && <span className="rcount">{rs.length}</span>}
                    </button>
                  );
                })}
                {(isParent || (isTeam && u.author_id === profile.id)) && (
                  <button type="button" className="tiny" style={{ marginLeft: "auto" }} onClick={() => remove(u)}>
                    remove
                  </button>
                )}
              </div>

              {/* comments */}
              {(comments[u.id] ?? []).map((c) => (
                <div key={c.id} className="comment">
                  <b>{c.author?.display_name ?? "Someone"}</b> {c.body}
                  <span className="muted"> · {fmtStamp(c.created_at)}</span>
                  {(isParent || c.author_id === profile.id) && (
                    <button
                      type="button"
                      className="tiny"
                      onClick={() => deleteComment(c.id)}
                      aria-label="Delete comment"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              <form
                className="row commentform"
                onSubmit={(e) => {
                  e.preventDefault();
                  addComment(u.id);
                }}
              >
                <input
                  type="text"
                  value={drafts[u.id] ?? ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [u.id]: e.target.value }))}
                  placeholder="Say something lovely…"
                  aria-label="Add a comment"
                />
                <button className="ghost" style={{ flex: "0 0 auto" }} type="submit">
                  Send
                </button>
              </form>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

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

export default function UpdatesTab() {
  const { supabase, profile, family, isParent } = useFamily();
  const [updates, setUpdates] = useState<Update[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});

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
    const { data } = await supabase
      .from("updates")
      .select("*, author:profiles!updates_author_id_fkey(id, display_name)")
      .eq("family_id", family.id)
      .order("created_at", { ascending: false });
    const rows = (data as Update[]) ?? [];
    setUpdates(rows);
    const paths = rows.flatMap((u) => u.image_paths ?? []);
    if (paths.length) setUrls(await signedUrlMap(supabase, paths));
  }, [supabase, family.id]);

  useEffect(() => {
    load();
  }, [load]);
  useRealtime(supabase, "updates", family.id, load);

  function tapFirst(first: string) {
    setMode("free");
    setMilestone(true);
    setLabel(first);
    setBody((b) => (b.trim() ? b : first));
    textRef.current?.focus();
  }

  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []).filter((f) =>
      f.type.startsWith("image/")
    );
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
      {isParent && (
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
              <div className="row">
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
            <button
              type="button"
              className="tiny"
              onClick={() => setMode(mode === "free" ? "guided" : "free")}
            >
              {mode === "free" ? "Use guided prompts" : "Free write"}
            </button>
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
            accept="image/*"
            multiple
            onChange={onPickFiles}
            style={{ display: "none" }}
          />
          <div className="composer-row">
            <button type="button" className="ghost" onClick={() => fileRef.current?.click()}>
              📷 Add photo{files.length ? ` (${files.length})` : ""}
            </button>
            <button className="primary" type="submit" disabled={busy}>
              {busy ? "Posting…" : "Post update"}
            </button>
          </div>
          {files.length > 0 && (
            <div className="thumbs">
              {files.map((f, i) => (
                <div key={i} className="thumb">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={URL.createObjectURL(f)} alt="" />
                  <button
                    type="button"
                    aria-label="Remove photo"
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

      <GrowthCard />

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
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={p} src={urls[p]} alt="Update photo" loading="lazy" />
                    ) : (
                      <div key={p} className="photo-skel" />
                    )
                  )}
                </div>
              )}
              {isParent && (
                <button className="tiny" onClick={() => remove(u)}>
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

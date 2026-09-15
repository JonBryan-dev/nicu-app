"use client";
// Cares — Maisie's 4-hourly round, built for one hand at the cotside.
// Start → tick through the steps (each with the how-to you'd forget at 3am)
// → finish. Position and foot-probe memory come from the last completed
// round. The open round is shared live, so Mum and Dad can split it. Parents
// only, like Feeds. Nudges ("due", "still waiting") come from the database
// sweep; "cares done" goes to the other parent from a trigger.
import { useCallback, useEffect, useRef, useState } from "react";
import { useFamily } from "@/components/FamilyProvider";
import { useRealtime } from "@/lib/useRealtime";
import { uploadPhotos, signedUrlMap } from "@/lib/photos";
import { fmtHM } from "@/lib/feedSchedule";
import { isoWeekKey } from "@/lib/dates";
import {
  CARE_STEPS,
  POSITIONS,
  nextPosition,
  positionLabel,
  otherFoot,
  tempFlag,
  dueLabel,
  hoursAgo,
  feedSlots,
  feedSlotNow,
  feedOnTime,
  feedStreak,
  FEED_ON_TIME_MIN,
  CARE_ON_TIME_MIN,
  scoreRound,
  careStreak,
  levelFor,
  computeBadges,
  feedTickPoints,
  dayKey,
  POINTS,
  DEFAULT_CARE_SETTINGS,
  DEFAULT_BLOCK_HOURS,
  NO_COVERAGE,
  parentOnAt,
  coveredMinutes,
  roundDue,
  type Coverage,
  type FeedTick,
  type CareRound,
  type CareTick,
  type CareSettings,
  type CareStep,
  type Position,
  type Foot,
} from "@/lib/cares";

const ROUND_SELECT =
  "*, starter:profiles!care_rounds_started_by_fkey(display_name), finisher:profiles!care_rounds_completed_by_fkey(display_name)";

export default function CareTab() {
  const { supabase, profile, family, isParent } = useFamily();
  const [settings, setSettings] = useState<CareSettings>(DEFAULT_CARE_SETTINGS);
  const [rounds, setRounds] = useState<CareRound[] | null>(null);
  const [lastDone, setLastDone] = useState<CareRound | null>(null);
  const [lastBedding, setLastBedding] = useState<CareRound | null>(null);
  const [ticks, setTicks] = useState<CareTick[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [feedPlan, setFeedPlan] = useState<{ first: string; every: number; ml: number | null } | null>(null);
  const [feedTicks, setFeedTicks] = useState<FeedTick[]>([]);
  const [hist, setHist] = useState<CareRound[]>([]); // every finished round, oldest first
  const [stepCounts, setStepCounts] = useState<Record<string, number>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [feedMl, setFeedMl] = useState(""); // what she actually had; prefilled from the plan
  const [planFirst, setPlanFirst] = useState("08:00");
  const [planEvery, setPlanEvery] = useState(120);
  const [planMl, setPlanMl] = useState("");
  const [cov, setCov] = useState<Coverage>(NO_COVERAGE);
  const [tempInput, setTempInput] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [, setClock] = useState(0); // re-render the countdown each minute
  const fileRef = useRef<HTMLInputElement>(null);
  const first = family.baby_name.split(" ")[0];

  const load = useCallback(async () => {
    if (!isParent) return;
    const since = new Date(Date.now() - 48 * 3600e3).toISOString();
    const [st, rd, done, bed, fs, ft, hs, sb, sd] = await Promise.all([
      supabase.from("care_settings").select("*").eq("family_id", family.id).maybeSingle(),
      supabase
        .from("care_rounds")
        .select(ROUND_SELECT)
        .eq("family_id", family.id)
        .gte("started_at", since)
        .order("started_at", { ascending: false }),
      supabase
        .from("care_rounds")
        .select(ROUND_SELECT)
        .eq("family_id", family.id)
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("care_rounds")
        .select("id, completed_at")
        .eq("family_id", family.id)
        .eq("bedding_changed", true)
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("feed_settings").select("baby_first_feed, baby_interval_min, baby_ml").eq("family_id", family.id).maybeSingle(),
      supabase
        .from("feed_ticks")
        .select("*, doer:profiles!feed_ticks_done_by_fkey(display_name)")
        .eq("family_id", family.id)
        .order("due_at", { ascending: false }),
      supabase
        .from("care_rounds")
        .select("id, family_id, started_by, started_at, completed_at, completed_by, position, foot, temperature, bedding_changed, note, photo_paths, steps_done, finisher:profiles!care_rounds_completed_by_fkey(display_name)")
        .eq("family_id", family.id)
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: true }),
      supabase
        .from("shift_blocks")
        .select("week_key, day_name, block_name, assignee")
        .eq("family_id", family.id)
        .in("week_key", [isoWeekKey(dayKey(new Date())), isoWeekKey(dayKey(new Date(Date.now() - 7 * 86400e3)))]),
      supabase.from("shift_defaults").select("day_name, block_name, assignee").eq("family_id", family.id),
    ]);
    if (rd.error && /care_rounds/.test(rd.error.message)) {
      setErr("Cares need the latest database migration (034) — run it and this page comes alive.");
      setRounds([]);
      return;
    }
    if (st.data) setSettings({ ...DEFAULT_CARE_SETTINGS, ...st.data });
    const rs = (rd.data as unknown as CareRound[]) ?? [];
    setRounds(rs);
    setLastDone((done.data as unknown as CareRound) ?? null);
    setLastBedding((bed.data as unknown as CareRound) ?? null);
    const plan = fs.data as { baby_first_feed: string | null; baby_interval_min: number | null; baby_ml: number | null } | null;
    setFeedPlan(
      plan?.baby_first_feed && plan.baby_interval_min
        ? { first: plan.baby_first_feed.slice(0, 5), every: plan.baby_interval_min, ml: plan.baby_ml ?? null }
        : null
    );
    if (plan?.baby_ml != null) setFeedMl((cur) => (cur === "" ? String(plan.baby_ml) : cur));
    if (plan?.baby_interval_min) setPlanEvery(plan.baby_interval_min);
    if (plan?.baby_ml != null) setPlanMl(String(plan.baby_ml));
    setFeedTicks((ft.data as unknown as FeedTick[]) ?? []);
    const all = (hs.data as unknown as CareRound[]) ?? [];
    setHist(all);
    // who's on when — strict block hours, this week's rota, else the usual pattern
    const hrs = st.data as Record<string, string | null> | null;
    const h = (k: string, d: string) => (hrs?.[k] ? String(hrs[k]).slice(0, 5) : d);
    const blocks: Record<string, string> = {};
    for (const b of (sb.data as { week_key: string; day_name: string; block_name: string; assignee: string }[]) ?? [])
      blocks[`${b.week_key}-${b.day_name}-${b.block_name}`] = b.assignee;
    const defaults: Record<string, string> = {};
    for (const b of (sd.data as { day_name: string; block_name: string; assignee: string }[]) ?? [])
      defaults[`${b.day_name}-${b.block_name}`] = b.assignee;
    setCov({
      blocks,
      defaults,
      hours: {
        AM: [h("am_from", DEFAULT_BLOCK_HOURS.AM[0]), h("am_to", DEFAULT_BLOCK_HOURS.AM[1])],
        PM: [h("pm_from", DEFAULT_BLOCK_HOURS.PM[0]), h("pm_to", DEFAULT_BLOCK_HOURS.PM[1])],
        Eve: [h("eve_from", DEFAULT_BLOCK_HOURS.Eve[0]), h("eve_to", DEFAULT_BLOCK_HOURS.Eve[1])],
      },
    });
    // rounds finished before steps_done existed: count their ticks (last 7 days only)
    const weekAgo = Date.now() - 7 * 86400e3;
    const needIds = all.filter((r) => r.steps_done == null && +new Date(r.completed_at!) > weekAgo).map((r) => r.id);
    if (needIds.length) {
      const { data: tk } = await supabase.from("care_ticks").select("round_id").in("round_id", needIds);
      const counts: Record<string, number> = {};
      for (const row of (tk as { round_id: string }[]) ?? []) counts[row.round_id] = (counts[row.round_id] ?? 0) + 1;
      setStepCounts(counts);
    }
    const open = rs.find((r) => !r.completed_at);
    if (open) {
      const { data: tk } = await supabase.from("care_ticks").select("*").eq("round_id", open.id);
      setTicks((tk as CareTick[]) ?? []);
    } else {
      setTicks([]);
    }
    const paths = rs.flatMap((r) => r.photo_paths ?? []);
    if (paths.length) setUrls(await signedUrlMap(supabase, paths));
  }, [supabase, family.id, isParent]);

  useEffect(() => {
    load();
  }, [load]);
  useRealtime(supabase, "care_rounds", family.id, load);
  useRealtime(supabase, "care_ticks", family.id, load);
  useRealtime(supabase, "care_settings", family.id, load);
  useRealtime(supabase, "feed_ticks", family.id, load);
  useRealtime(supabase, "shift_blocks", family.id, load);
  useEffect(() => {
    const t = setInterval(() => setClock((c) => c + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  if (!isParent) {
    return (
      <section>
        <div className="card">
          <div className="empty">This one&apos;s just for mum &amp; dad.</div>
        </div>
      </section>
    );
  }

  // ---- derived ----
  const open = rounds?.find((r) => !r.completed_at) ?? null;
  const completed = (rounds ?? []).filter((r) => r.completed_at);
  const dueAt = roundDue(lastDone, settings.round_interval_min, cov);
  const due = dueAt ? dueLabel(dueAt) : null;
  const suggestedPos = nextPosition(lastDone?.position ?? null);
  const suggestedFoot = otherFoot(lastDone?.foot ?? null);
  const beddingAgeH = lastBedding?.completed_at
    ? (Date.now() - +new Date(lastBedding.completed_at)) / 3600e3
    : Infinity;
  const beddingDue = beddingAgeH >= settings.bedding_hours;
  const ticked = new Set(ticks.map((t) => t.key));
  const stepDone = (s: CareStep) => {
    if (!open) return false;
    switch (s.kind) {
      case "foot":
        return open.foot != null;
      case "temp":
        return open.temperature != null;
      case "position":
        return open.position != null;
      default:
        return ticked.has(s.key);
    }
  };
  const doneCount = CARE_STEPS.filter(stepDone).length;
  const todayKey = new Date().toDateString();
  const now = new Date();
  const tickByDue = new Map(feedTicks.map((t) => [+new Date(t.due_at), t]));
  const slotsToday = feedPlan ? feedSlots(feedPlan.first, feedPlan.every, now) : [];
  const feedNow = feedPlan ? feedSlotNow(feedPlan.first, feedPlan.every, now) : null;
  const currentTick = feedNow ? tickByDue.get(+feedNow.current) : undefined;
  // the button targets the current slot until it's ticked, then the next one
  const feedTarget = feedNow ? (currentTick ? feedNow.next : feedNow.current) : null;
  const feedDue = feedTarget ? dueLabel(feedTarget, now) : null;
  const onAt = (d: Date) => parentOnAt(cov, d);
  const dotState = (slot: Date): "done" | "late" | "missed" | "now" | "todo" | "nurses" => {
    const tk = tickByDue.get(+slot);
    if (tk) return feedOnTime(tk) ? "done" : "late";
    if (!onAt(slot)) return "nurses";
    if (feedNow && +slot === +feedNow.current) return "now";
    if (+now - +slot > settings.feed_late_min * 60000) return "missed";
    return "todo";
  };
  const slotsMine = slotsToday.filter(onAt); // the feeds that are yours today
  const fedToday = slotsToday.filter((s) => tickByDue.has(+s)).length;
  const onTimeToday = slotsMine.filter((s) => { const k = tickByDue.get(+s); return k && feedOnTime(k); }).length;
  const targetCovered = feedTarget ? onAt(feedTarget) : true;
  const mlToday = Math.round(slotsToday.reduce((a, s) => a + (tickByDue.get(+s)?.ml ?? 0), 0) * 10) / 10;
  const streak = feedPlan ? feedStreak(feedPlan.first, feedPlan.every, feedTicks, now, cov) : 0;
  const roundsPerDay = Math.round(coveredMinutes(cov, now) / settings.round_interval_min);
  const roundsToday = completed.filter((r) => new Date(r.completed_at!).toDateString() === todayKey).length;

  // ---- scoring ----
  const stepsFor = (r: CareRound) => r.steps_done ?? stepCounts[r.id] ?? 0;
  const scoreOf = new Map<string, ReturnType<typeof scoreRound>>();
  hist.forEach((r, i) => scoreOf.set(r.id, scoreRound(r, i > 0 ? hist[i - 1] : null, settings.round_interval_min, stepsFor(r), cov)));
  const roundStreak = careStreak(hist, settings.round_interval_min, cov);
  const todayK = dayKey(now);
  const feedPointsOn = (k: string) =>
    feedTicks.filter((x) => dayKey(new Date(x.due_at)) === k).reduce((a, x) => a + feedTickPoints(x), 0);
  const roundPointsOn = (k: string) =>
    hist.filter((r) => dayKey(new Date(r.completed_at!)) === k).reduce((a, r) => a + (scoreOf.get(r.id)?.points ?? 0), 0);
  const pointsToday = feedPointsOn(todayK) + roundPointsOn(todayK);
  const lifetimePoints =
    feedTicks.reduce((a, x) => a + feedTickPoints(x), 0) + hist.reduce((a, r) => a + (scoreOf.get(r.id)?.points ?? 0), 0);
  const level = levelFor(lifetimePoints, first);
  const badges = computeBadges({ rounds: hist, stepsFor, ticks: feedTicks, feedPlan, feedStreak: streak, now, cov });
  const earnedCount = badges.filter((b) => b.earned).length;
  // today's team — who did what
  const tally: Record<string, { feeds: number; rounds: number }> = {};
  for (const x of feedTicks)
    if (dayKey(new Date(x.due_at)) === todayK) {
      const n = x.doer?.display_name ?? "Someone";
      (tally[n] ??= { feeds: 0, rounds: 0 }).feeds++;
    }
  for (const r of hist)
    if (dayKey(new Date(r.completed_at!)) === todayK) {
      const n = r.finisher?.display_name ?? "Someone";
      (tally[n] ??= { feeds: 0, rounds: 0 }).rounds++;
    }
  // the week, day by day (feed dots only from the first tick onwards)
  const firstTickMs = feedTicks.length ? Math.min(...feedTicks.map((x) => +new Date(x.due_at))) : Infinity;
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - i));
    d.setHours(12, 0, 0, 0);
    const k = dayKey(d);
    const slots = feedPlan ? feedSlots(feedPlan.first, feedPlan.every, d) : [];
    return {
      key: k,
      label: `${DOW[d.getDay()]} ${d.getDate()}`,
      slots,
      tracked: slots.length > 0 && +slots[slots.length - 1] >= firstTickMs,
      rounds: hist.filter((r) => dayKey(new Date(r.completed_at!)) === k).length,
      expected: Math.round(coveredMinutes(cov, d) / settings.round_interval_min),
      points: feedPointsOn(k) + roundPointsOn(k),
      isToday: k === todayK,
    };
  });
  const bestDay = Math.max(0, ...week.filter((w) => !w.isToday).map((w) => w.points));
  const say = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 7000);
  };

  // ---- actions ----
  async function startRound() {
    setErr("");
    const { error } = await supabase.from("care_rounds").insert({ family_id: family.id, started_by: profile.id });
    if (error) setErr(error.message);
    load();
  }

  async function toggleTick(key: string) {
    if (!open) return;
    const on = ticked.has(key);
    // optimistic — at the cotside the tick has to feel instant
    setTicks((t) =>
      on ? t.filter((x) => x.key !== key) : [...t, { round_id: open.id, key, done_by: profile.id, done_at: new Date().toISOString() }]
    );
    if (on) await supabase.from("care_ticks").delete().match({ round_id: open.id, key });
    else await supabase.from("care_ticks").upsert({ round_id: open.id, key, done_by: profile.id }, { onConflict: "round_id,key" });
    load();
  }

  async function patchRound(fields: Partial<CareRound>) {
    if (!open) return;
    setErr("");
    const { error } = await supabase.from("care_rounds").update(fields).eq("id", open.id);
    if (error) setErr(error.message);
    load();
  }

  async function saveTemp() {
    const t = parseFloat(tempInput.replace(",", "."));
    if (isNaN(t)) return;
    if (t < 30 || t > 43) {
      setErr("That doesn't look like a temperature in °C — try again.");
      return;
    }
    await patchRound({ temperature: t });
  }

  async function markBedding(changed: boolean) {
    if (!open) return;
    if (!ticked.has("bedding")) await toggleTick("bedding");
    if (changed !== open.bedding_changed) await patchRound({ bedding_changed: changed });
  }

  async function addPhotos(files: File[]) {
    if (!open || !files.length) return;
    setBusy(true);
    setErr("");
    try {
      const paths = await uploadPhotos(supabase, family.id, files);
      await patchRound({ photo_paths: [...(open.photo_paths ?? []), ...paths] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Photo didn't upload.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function finishRound() {
    if (!open) return;
    setBusy(true);
    const steps = CARE_STEPS.filter(stepDone).length;
    const finishedAt = new Date().toISOString();
    await patchRound({
      completed_at: finishedAt,
      completed_by: profile.id,
      note: note.trim() || null,
      steps_done: steps,
    });
    const sc = scoreRound(
      { ...open, completed_at: finishedAt, completed_by: profile.id },
      lastDone,
      settings.round_interval_min,
      steps
    );
    say(
      `Round done · +${sc.points} pts` +
        (sc.full ? " · full house 🏠" : ` · ${steps}/${CARE_STEPS.length} steps`) +
        (sc.onTime ? " · on time ✓" : "")
    );
    setNote("");
    setTempInput("");
    setBusy(false);
  }

  async function scrapRound() {
    if (!open) return;
    if (!window.confirm("Scrap this round? Nothing ticked will be kept.")) return;
    await supabase.from("care_rounds").delete().eq("id", open.id);
    load();
  }

  async function tickFeed(slot: Date) {
    setErr("");
    const { error } = await supabase.from("feed_ticks").upsert(
      {
        family_id: family.id,
        due_at: slot.toISOString(),
        done_by: profile.id,
        ml: feedMl.trim() ? parseFloat(feedMl.replace(",", ".")) : (feedPlan?.ml ?? null),
      },
      { onConflict: "family_id,due_at" }
    );
    if (error) setErr(/feed_ticks/.test(error.message) ? "Feed ticks need database migration 035." : error.message);
    else {
      const late = +new Date() - +slot > FEED_ON_TIME_MIN * 60000;
      say(late ? `${fmtHM(slot)} feed ticked · +${POINTS.feedLate} pts` : `${fmtHM(slot)} feed on time · +${POINTS.feedOnTime} pts ✓`);
    }
    load();
  }
  async function untickFeed(t: FeedTick) {
    if (!window.confirm(`Untick the ${fmtHM(new Date(t.due_at))} feed?`)) return;
    await supabase.from("feed_ticks").delete().eq("id", t.id);
    load();
  }

  async function savePlan(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const { error } = await supabase.from("feed_settings").upsert({
      family_id: family.id,
      baby_first_feed: planFirst,
      baby_interval_min: planEvery,
      baby_ml: planMl.trim() ? parseFloat(planMl.replace(",", ".")) : null,
      updated_at: new Date().toISOString(),
    });
    if (error) setErr("Plan didn't save: " + error.message);
    load();
  }

  async function saveSettings(next: Partial<CareSettings>) {
    const merged = { ...settings, ...next };
    setSettings(merged);
    const { error } = await supabase
      .from("care_settings")
      .upsert({ family_id: family.id, ...merged, updated_at: new Date().toISOString() });
    if (error) setErr("Settings didn't save: " + error.message);
  }

  const flag = (t: number | null) => {
    const f = tempFlag(t);
    if (!f) return null;
    return (
      <span className={`tempflag ${f}`}>
        {f === "ok" ? "in range" : f === "low" ? "below 36.5 — mention it to the nurse" : "above 37.5 — mention it to the nurse"}
      </span>
    );
  };

  const intervalH = Math.round((settings.round_interval_min / 60) * 10) / 10;

  return (
    <section>
      {/* hero: what's next */}
      <div className="card">
        <h2>{first}&apos;s cares</h2>
        {toast && (
          <p className="toast" role="status">
            {toast}
          </p>
        )}
        {open ? (
          <>
            <p className="note">
              Round started {fmtHM(new Date(open.started_at))}
              {open.starter ? ` by ${open.starter.display_name}` : ""} · {doneCount} of {CARE_STEPS.length} done
            </p>
            <div className="progress">
              <i style={{ width: `${Math.round((doneCount / CARE_STEPS.length) * 100)}%` }} />
            </div>
          </>
        ) : (
          <>
            <div className="caredue">
              <div className={`big ${due?.state ?? ""}`}>{dueAt ? fmtHM(dueAt) : "—"}</div>
              <div className="muted">
                {due ? `next cares ${due.text}` : "no round logged yet — start whenever you're ready"}
              </div>
            </div>
            <button className="primary" onClick={startRound} disabled={rounds === null}>
              Start cares
            </button>
            <p className="muted" style={{ marginTop: 8 }}>
              Every {intervalH}h
              {feedPlan ? ` · feeds every ${Math.round((feedPlan.every / 60) * 10) / 10}h` : " · feed plan not set yet — see below"}
              {" · bedding "}
              {lastBedding?.completed_at ? `changed ${hoursAgo(lastBedding.completed_at)}` : "not logged yet"}
              {beddingDue && lastBedding ? " ⚠ change due" : ""}
            </p>
          </>
        )}
        {err && <p className="err">{err}</p>}
      </div>

      {/* the round itself */}
      {open && (
        <div className="card">
          <h2>This round</h2>
          <p className="note">
            Last time: {positionLabel(lastDone?.position ?? null)} · probe on {lastDone?.foot ?? "—"} foot
            {lastDone?.temperature != null ? ` · ${lastDone.temperature}°C` : ""}
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            hidden
            onChange={(e) => addPhotos(Array.from(e.target.files ?? []))}
          />
          {CARE_STEPS.map((step) => {
            const isDone = stepDone(step);
            const plain = step.kind === "tick";
            return (
              <div key={step.key} className={`carestep ${isDone ? "done" : ""}`}>
                <button
                  type="button"
                  className="carecheck"
                  aria-pressed={isDone}
                  aria-label={`${step.title}: ${isDone ? "done" : "not done"}`}
                  disabled={!plain}
                  onClick={() => plain && toggleTick(step.key)}
                >
                  {isDone ? "✓" : ""}
                </button>
                <div className="carebody">
                  <div className="caretitle">{step.title}</div>
                  <div className="carehow">{step.how}</div>

                  {step.kind === "foot" && (
                    <div className="careopts">
                      {(["left", "right"] as Foot[]).map((f) => (
                        <button
                          key={f}
                          type="button"
                          className={`careopt ${open.foot === f ? "on" : ""} ${!open.foot && suggestedFoot === f ? "hint" : ""}`}
                          onClick={() => patchRound({ foot: f })}
                        >
                          {f} foot{!open.foot && suggestedFoot === f ? " — next" : ""}
                        </button>
                      ))}
                    </div>
                  )}

                  {step.kind === "temp" && (
                    <div className="careopts">
                      {open.temperature != null ? (
                        <>
                          <span className="careopt on">{open.temperature}°C</span>
                          {flag(open.temperature)}
                          <button type="button" className="tiny" onClick={() => patchRound({ temperature: null })}>
                            change
                          </button>
                        </>
                      ) : (
                        <>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={tempInput}
                            onChange={(e) => setTempInput(e.target.value)}
                            placeholder="36.8"
                            aria-label="Temperature in °C"
                            style={{ width: 90 }}
                          />
                          <button type="button" className="ghost" onClick={saveTemp}>
                            Save
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {step.kind === "position" && (
                    <div className="careopts">
                      {POSITIONS.map((p) => (
                        <button
                          key={p.value}
                          type="button"
                          className={`careopt ${open.position === p.value ? "on" : ""} ${!open.position && suggestedPos === p.value ? "hint" : ""}`}
                          onClick={() => patchRound({ position: p.value as Position })}
                        >
                          {p.short}
                          {!open.position && suggestedPos === p.value ? " — next" : ""}
                        </button>
                      ))}
                    </div>
                  )}

                  {step.kind === "bedding" && (
                    <div className="careopts">
                      <button
                        type="button"
                        className={`careopt ${isDone && !open.bedding_changed ? "on" : ""}`}
                        onClick={() => markBedding(false)}
                      >
                        Checked — fine
                      </button>
                      <button
                        type="button"
                        className={`careopt ${open.bedding_changed ? "on" : ""} ${beddingDue && !isDone ? "hint" : ""}`}
                        onClick={() => markBedding(true)}
                      >
                        Changed it 🛏{beddingDue && !isDone ? " — due" : ""}
                      </button>
                      <span className="muted" style={{ fontSize: "0.8rem" }}>
                        last change {lastBedding?.completed_at ? hoursAgo(lastBedding.completed_at) : "not logged"}
                      </span>
                    </div>
                  )}

                  {step.photo && (
                    <div className="careopts">
                      <button type="button" className="tiny" disabled={busy} onClick={() => fileRef.current?.click()}>
                        📷 {busy ? "uploading…" : "add a photo"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {(open.photo_paths?.length ?? 0) > 0 && (
            <div className="carethumbs">
              {open.photo_paths.map((p) =>
                urls[p] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={p} src={urls[p]} alt="Care round photo" onClick={() => setLightbox(p)} />
                ) : null
              )}
            </div>
          )}

          <label htmlFor="care-note" style={{ marginTop: 12 }}>
            Anything to note (optional)
          </label>
          <input
            id="care-note"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. a bit unsettled, red patch behind left ear"
          />
          <div className="row" style={{ marginTop: 12 }}>
            <button className="primary" onClick={finishRound} disabled={busy}>
              Finish cares{doneCount < CARE_STEPS.length ? ` (${doneCount}/${CARE_STEPS.length})` : ""}
            </button>
            <button type="button" className="tiny" style={{ flex: "0 0 auto" }} onClick={scrapRound}>
              scrap
            </button>
          </div>
        </div>
      )}

      {/* no feed plan yet — set it here, it's the same one Feeds uses */}
      {rounds !== null && !feedPlan && (
        <form className="card" onSubmit={savePlan}>
          <h2>Feeds</h2>
          <p className="note">
            Tell it the unit&apos;s plan — first feed of the day and how often — and every feed appears here to tick, with reminders.
          </p>
          <div className="row rowwrap">
            <div>
              <label htmlFor="fp-first">First feed</label>
              <input id="fp-first" type="time" value={planFirst} onChange={(e) => setPlanFirst(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="fp-every">How often</label>
              <select id="fp-every" value={planEvery} onChange={(e) => setPlanEvery(+e.target.value)}>
                <option value={60}>Hourly</option>
                <option value={90}>1½-hourly</option>
                <option value={120}>2-hourly</option>
                <option value={180}>3-hourly</option>
                <option value={240}>4-hourly</option>
              </select>
            </div>
            <div>
              <label htmlFor="fp-ml">ml per feed</label>
              <input id="fp-ml" type="text" inputMode="decimal" value={planMl} onChange={(e) => setPlanMl(e.target.value)} placeholder="35" />
            </div>
          </div>
          <button className="primary" type="submit" style={{ marginTop: 12 }}>
            Save feed plan
          </button>
        </form>
      )}

      {/* feeds: the ward's grid, one tick each */}
      {feedPlan && feedNow && feedTarget && feedDue && (
        <div className="card">
          <h2>{!targetCovered ? "Nurses' feed" : currentTick ? "Next feed" : "Feed"}</h2>
          <div className="caredue">
            <div className={`big ${feedDue.state}`}>{fmtHM(feedTarget)}</div>
            <div className="muted">
              {currentTick
                ? `${fmtHM(new Date(currentTick.due_at))} ticked${currentTick.doer ? ` by ${currentTick.doer.display_name}` : ""} · next ${feedDue.text}`
                : feedDue.text}
              {" · every "}
              {Math.round((feedPlan.every / 60) * 10) / 10}h{feedPlan.ml ? ` · ${feedPlan.ml} ml` : ""}
              {!targetCovered ? " · outside your shift — the nurses have her" : ""}
            </div>
          </div>
          <div className="row" style={{ alignItems: "stretch" }}>
            <button
              className={currentTick || !targetCovered ? "ghost" : "primary"}
              onClick={() => tickFeed(feedTarget)}
              style={{ flex: 1 }}
            >
              ✓ {!targetCovered ? `Did the ${fmtHM(feedTarget)} feed yourself?` : currentTick ? `Mark ${fmtHM(feedTarget)} fed` : `Fed — ${fmtHM(feedTarget)}`}
            </button>
            <div style={{ flex: "0 0 92px" }}>
              <input
                type="text"
                inputMode="decimal"
                value={feedMl}
                onChange={(e) => setFeedMl(e.target.value)}
                placeholder={feedPlan.ml ? String(feedPlan.ml) : "ml"}
                aria-label="Millilitres she had"
                style={{ textAlign: "center" }}
              />
            </div>
          </div>
          <div className="dots" aria-label="Today's feeds">
            {slotsToday.map((s) => {
              const st = dotState(s);
              const tk = tickByDue.get(+s);
              const future = !tk && s > now;
              return (
                <button
                  key={+s}
                  type="button"
                  className={`dot ${st}`}
                  disabled={future}
                  title={`${fmtHM(s)} — ${st === "done" ? "on time" : st === "late" ? "ticked late" : st === "missed" ? "not ticked" : st === "now" ? "due now" : st === "nurses" ? "nurses' feed" : "later"}`}
                  aria-label={`${fmtHM(s)} feed, ${st}`}
                  onClick={() => (tk ? untickFeed(tk) : tickFeed(s))}
                />
              );
            })}
          </div>
          <div className="dotlabel">
            <span>
              <b>{fedToday}</b> ticked · <b>{onTimeToday}</b> of your {slotsMine.length} on time
              {mlToday > 0 ? <> · <b>{mlToday}</b> ml</> : null}
            </span>
            <span>dashed = nurses&apos; time</span>
          </div>
        </div>
      )}

      {/* today, at a glance */}
      <div className="card">
        <h2>Today</h2>
        <div className="scoreline">
          <span className="score">{pointsToday}</span>
          <span className="muted"> pts today{bestDay ? ` · best this week ${bestDay}` : ""}</span>
        </div>
        {feedPlan && (
          <>
            <div className="dotlabel" style={{ marginTop: 6 }}>
              <span>Feeds <span className="muted">(yours today)</span></span>
              <span><b>{slotsMine.filter((s) => tickByDue.has(+s)).length}</b> / {slotsMine.length}</span>
            </div>
            <div className="dots">
              {slotsToday.map((s) => (
                <span key={+s} className={`dot ${dotState(s)}`} style={{ width: 14, height: 14, cursor: "default" }} />
              ))}
            </div>
          </>
        )}
        <div className="dotlabel">
          <span>Cares rounds <span className="muted">(your shifts)</span></span>
          <span><b>{roundsToday}</b> / {roundsPerDay}</span>
        </div>
        {roundsPerDay > 0 ? (
          <div className="dots">
            {Array.from({ length: Math.max(roundsPerDay, roundsToday) }, (_, i) => (
              <span key={i} className={`dot ${i < roundsToday ? "done" : "todo"}`} style={{ width: 14, height: 14, cursor: "default" }} />
            ))}
          </div>
        ) : (
          <p className="muted" style={{ fontSize: "0.85rem" }}>Day off — the nurses have her today. Anything you do still counts.</p>
        )}
        <div className="streaks">
          {feedPlan && (
            <div className="streak">
              {streak > 0 ? `🔥 ${streak} feed${streak === 1 ? "" : "s"} on time in a row` : "🔥 Tick the next feed on time to start a streak"}
            </div>
          )}
          <div className="streak">
            {roundStreak > 0 ? `⏱ ${roundStreak} round${roundStreak === 1 ? "" : "s"} on time in a row` : "⏱ Finish a round within the hour of due to start a streak"}
          </div>
        </div>
        {Object.keys(tally).length > 0 && (
          <div className="tally">
            <span className="muted">Today&apos;s team</span>
            {Object.entries(tally)
              .sort((x, y) => y[1].feeds + y[1].rounds - (x[1].feeds + x[1].rounds))
              .map(([name, n]) => (
                <span key={name} className="tally-who">
                  <b>{name}</b> {n.feeds} feed{n.feeds === 1 ? "" : "s"} · {n.rounds} round{n.rounds === 1 ? "" : "s"}
                </span>
              ))}
          </div>
        )}
        <p className="muted" style={{ marginTop: 8 }}>
          Feeds {POINTS.feedOnTime} on time / {POINTS.feedLate} late · rounds {POINTS.round}, +{POINTS.roundOnTime} within the hour, +{POINTS.fullRound} full house, +{POINTS.bedding} fresh bedding, +{POINTS.photo} a photo. On time = {FEED_ON_TIME_MIN} min for feeds, {CARE_ON_TIME_MIN} for rounds. Outside your shifts the nurses have her — nothing then is held against you.
        </p>
      </div>

      {/* level & badges */}
      <div className="card">
        <h2>
          Level {level.index} · {level.name}
        </h2>
        <div className="progress levelbar">
          <i style={{ width: `${Math.round(level.progress * 100)}%` }} />
        </div>
        <div className="dotlabel" style={{ marginTop: 0 }}>
          <span><b>{lifetimePoints.toLocaleString()}</b> pts all time</span>
          <span>{level.next ? `${(level.next.at - lifetimePoints).toLocaleString()} to ${level.next.name.replace("{baby}", first)}` : "top level"}</span>
        </div>
        <div className="dotlabel">
          <span>Badges</span>
          <span><b>{earnedCount}</b> / {badges.length}</span>
        </div>
        <div className="badges">
          {badges.map((b) => (
            <span key={b.key} className={`badge-chip ${b.earned ? "earned" : "locked"}`} title={b.how}>
              <span className="badge-emoji" aria-hidden="true">{b.emoji}</span>
              <span className="badge-name">{b.name}</span>
              <span className="badge-how">{b.how}</span>
            </span>
          ))}
        </div>
      </div>

      {/* this week */}
      <div className="card">
        <h2>This week</h2>
        <div className="week">
          {week.map((w) => (
            <div key={w.key} className={`weekrow ${w.isToday ? "today" : ""}`}>
              <span className="weekday">{w.isToday ? "Today" : w.label}</span>
              <span className="weekdots">
                {w.tracked
                  ? w.slots.map((s) => <span key={+s} className={`dot mini ${dotState(s)}`} />)
                  : <span className="muted" style={{ fontSize: "0.78rem" }}>{feedPlan ? "before feeds were tracked" : "no feed plan"}</span>}
              </span>
              <span className="weeknum">{w.rounds}/{w.expected} rnd</span>
              <span className="weeknum pts">{w.points}</span>
            </div>
          ))}
        </div>
        <p className="muted" style={{ marginTop: 6 }}>Dots are feeds; the last column is points for the day.</p>
      </div>

      {/* the record */}
      <div className="card">
        <h2>Last 48 hours</h2>
        {rounds === null ? null : completed.length === 0 ? (
          <div className="empty">Finished rounds show here — who, when, position, temperature.</div>
        ) : (
          completed.map((r) => {
            const at = new Date(r.completed_at!);
            const notToday = at.toDateString() !== todayKey;
            const f = tempFlag(r.temperature);
            return (
              <div key={r.id} className="careround">
                <span className="t">
                  {fmtHM(at)}
                  {notToday && <span className="muted" style={{ fontWeight: 400 }}> yday</span>}
                </span>
                <span style={{ flex: 1 }}>
                  {r.finisher?.display_name ?? "—"}
                  {r.position ? ` · ${POSITIONS.find((p) => p.value === r.position)?.short.toLowerCase()}` : ""}
                  {r.foot ? ` · probe ${r.foot}` : ""}
                  {r.temperature != null && (
                    <>
                      {" · "}
                      <span className={f && f !== "ok" ? "tempflag " + f : ""}>{r.temperature}°C</span>
                    </>
                  )}
                  {r.bedding_changed ? " · 🛏 fresh" : ""}
                  {scoreOf.has(r.id) && (
                    <span className="muted">
                      {" · "}
                      {stepsFor(r)}/{CARE_STEPS.length} steps · <b>+{scoreOf.get(r.id)!.points}</b>
                      {scoreOf.get(r.id)!.onTime ? " ✓" : ""}
                    </span>
                  )}
                  {r.note && <div className="muted">“{r.note}”</div>}
                </span>
                {(r.photo_paths?.length ?? 0) > 0 && (
                  <div className="carethumbs">
                    {r.photo_paths.map((p) =>
                      urls[p] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={p} src={urls[p]} alt="Care round photo" onClick={() => setLightbox(p)} />
                      ) : null
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* settings */}
      <div className="card">
        {!showSettings ? (
          <button className="ghost" onClick={() => setShowSettings(true)}>
            Cares settings
          </button>
        ) : (
          <>
            <h2>Cares settings</h2>
            <div className="row rowwrap">
              <div>
                <label htmlFor="cs-int">Cares every</label>
                <select id="cs-int" value={settings.round_interval_min} onChange={(e) => saveSettings({ round_interval_min: +e.target.value })}>
                  <option value={120}>2 hours</option>
                  <option value={180}>3 hours</option>
                  <option value={240}>4 hours</option>
                  <option value={360}>6 hours</option>
                </select>
              </div>
              <div>
                <label htmlFor="cs-bed">Bedding at least every</label>
                <select id="cs-bed" value={settings.bedding_hours} onChange={(e) => saveSettings({ bedding_hours: +e.target.value })}>
                  <option value={12}>12 hours</option>
                  <option value={24}>24 hours</option>
                  <option value={48}>48 hours</option>
                </select>
              </div>
            </div>
            <div className="row rowwrap" style={{ marginTop: 10 }}>
              <div>
                <label htmlFor="cs-nudge">Nudge when due</label>
                <select id="cs-nudge" value={settings.notify_due ? "on" : "off"} onChange={(e) => saveSettings({ notify_due: e.target.value === "on" })}>
                  <option value="on">On — and again if still waiting</option>
                  <option value="off">Off</option>
                </select>
              </div>
              <div>
                <label htmlFor="cs-late">“Still waiting” after</label>
                <select id="cs-late" value={settings.overdue_after_min} onChange={(e) => saveSettings({ overdue_after_min: +e.target.value })}>
                  <option value={30}>30 min</option>
                  <option value={45}>45 min</option>
                  <option value={60}>60 min</option>
                </select>
              </div>
            </div>
            {feedPlan && (
              <div className="row rowwrap" style={{ marginTop: 10 }}>
                <div>
                  <label htmlFor="cs-feeds">Feed reminders</label>
                  <select id="cs-feeds" value={settings.notify_feeds ? "on" : "off"} onChange={(e) => saveSettings({ notify_feeds: e.target.value === "on" })}>
                    <option value="on">On — at each feed time</option>
                    <option value="off">Off</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="cs-flate">Feed “still waiting” after</label>
                  <select id="cs-flate" value={settings.feed_late_min} onChange={(e) => saveSettings({ feed_late_min: +e.target.value })}>
                    <option value={15}>15 min</option>
                    <option value={30}>30 min</option>
                    <option value={45}>45 min</option>
                  </select>
                </div>
              </div>
            )}
            <p className="muted" style={{ marginTop: 8 }}>
              Feed times follow the unit&apos;s plan set in Feeds ({feedPlan ? `${feedPlan.first}, every ${Math.round((feedPlan.every / 60) * 10) / 10}h` : "not set yet"}). The next cares round is timed from when the last one was finished. Whoever finishes a round, the other parent gets a note with the temperature and position.
            </p>
            <button className="tiny" style={{ marginTop: 8 }} onClick={() => setShowSettings(false)}>
              Done
            </button>
          </>
        )}
      </div>

      {lightbox && urls[lightbox] && (
        <div className="overlay lightbox" onClick={() => setLightbox(null)} role="dialog" aria-label="Photo viewer">
          <div className="lightbox-inner" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={urls[lightbox]} alt="Full-size photo" />
            <button className="ghost" style={{ marginTop: 10 }} onClick={() => setLightbox(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

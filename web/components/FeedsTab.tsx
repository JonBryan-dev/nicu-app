"use client";
// Feeds — mum & dad's private feeding hub: live feed timer, the day's grid
// (auto-spaced from "feeds per 24h", re-anchored by each actual feed),
// editable/backdatable feed log, multiple protected-sleep windows, supply vs
// demand (pump sessions count as supply), and the calendar link.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFamily } from "@/components/FamilyProvider";
import { useRealtime } from "@/lib/useRealtime";
import {
  computeSchedule,
  computeGaps,
  babyFeedTimes,
  babyFeedsPerDay,
  fmtHM,
  DEFAULT_SETTINGS,
  type FeedSettingsRow,
  type SleepWindowRow,
  type SlotRow,
} from "@/lib/feedSchedule";
import { todayKey, dayNumber } from "@/lib/dates";
import { PowerPumpButton } from "@/components/PowerPumpProvider";
import PumpHistory from "@/components/PumpHistory";
import PumpDays from "@/components/PumpDays";
import PumpLog from "@/components/PumpLog";
import TopBreast from "@/components/TopBreast";

type FeedRecord = {
  id: string;
  started_at: string;
  ended_at: string | null;
  ml: number | null;
  ml_left: number | null;
  ml_right: number | null;
  method: string;
};

const METHODS: { value: string; label: string }[] = [
  { value: "breast", label: "Breast" },
  { value: "bottle", label: "Bottle" },
  { value: "pump", label: "Pump" },
  { value: "ngt", label: "NG tube" },
  { value: "other", label: "Other" },
];

function MethodSelect({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {METHODS.map((m) => (
        <option key={m.value} value={m.value}>
          {m.label}
        </option>
      ))}
    </select>
  );
}

export default function FeedsTab() {
  const { supabase, profile, family, isParent } = useFamily();
  const [settings, setSettings] = useState<FeedSettingsRow>(DEFAULT_SETTINGS);
  const [windows, setWindows] = useState<SleepWindowRow[]>([]);
  const [feeds, setFeeds] = useState<FeedRecord[]>([]);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [exprToday, setExprToday] = useState(0);
  const [historyTotals, setHistoryTotals] = useState<Record<string, number>>({});
  const [exprMl, setExprMl] = useState("");
  const [finishMl, setFinishMl] = useState("");
  const [finishMethod, setFinishMethod] = useState("pump");
  const [tick, setTick] = useState(0);
  const [showPlan, setShowPlan] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editTime, setEditTime] = useState("");
  const [editMl, setEditMl] = useState("");
  const [editMethod, setEditMethod] = useState("bottle");
  const [showPast, setShowPast] = useState(false);
  const [pastDate, setPastDate] = useState(todayKey());
  const [pastTime, setPastTime] = useState("");
  const [pastMl, setPastMl] = useState("");
  const [pastLeft, setPastLeft] = useState("");
  const [pastRight, setPastRight] = useState("");
  const [pastMins, setPastMins] = useState("");
  const [pastMethod, setPastMethod] = useState("pump");
  const [err, setErr] = useState("");

  const dayKey = todayKey();

  const load = useCallback(async () => {
    if (!isParent) return;
    const dayStart = new Date(new Date().setHours(0, 0, 0, 0));
    const weekAgoIso = new Date(+dayStart - 7 * 864e5).toISOString();
    const dayStartIso = dayStart.toISOString();
    const [st, sw, fd, sl, ex] = await Promise.all([
      supabase.from("feed_settings").select("*").eq("family_id", family.id).maybeSingle(),
      supabase.from("sleep_windows").select("*").eq("family_id", family.id).order("start_time"),
      supabase.from("feeds").select("*").eq("family_id", family.id).gte("started_at", weekAgoIso).order("started_at"),
      supabase
        .from("visit_slots")
        .select("slot_date, start_time, end_time, booker:profiles!visit_slots_booked_by_fkey(display_name)")
        .eq("family_id", family.id)
        .eq("slot_date", dayKey),
      supabase.from("expressing_logs").select("ml, at").eq("family_id", family.id).gte("at", weekAgoIso),
    ]);
    if (st.data) setSettings({ ...DEFAULT_SETTINGS, ...st.data });
    setWindows((sw.data as SleepWindowRow[]) ?? []);
    const allFeeds = (fd.data as FeedRecord[]) ?? [];
    // today's sessions — plus any still-running one from before midnight, so a
    // pump straddling midnight keeps its timer and can still be finished
    setFeeds(allFeeds.filter((f) => f.started_at >= dayStartIso || !f.ended_at));
    // daily expressed totals for the last 7 full days (coach input)
    const totals: Record<string, number> = {};
    const dayOf = (iso: string) => {
      const d = new Date(iso);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    for (const f of allFeeds) if (f.ml) totals[dayOf(f.started_at)] = (totals[dayOf(f.started_at)] ?? 0) + f.ml;
    for (const r of ((ex.data as { ml: number; at: string }[]) ?? []))
      totals[dayOf(r.at)] = (totals[dayOf(r.at)] ?? 0) + r.ml;
    setHistoryTotals(totals);
    setSlots(
      ((sl.data as unknown as { slot_date: string; start_time: string; end_time: string; booker: { display_name: string } | null }[]) ?? []).map(
        (s) => ({ slot_date: s.slot_date, start_time: s.start_time, end_time: s.end_time, booker: s.booker?.display_name ?? null })
      )
    );
    setExprToday(
      (((ex.data as { ml: number; at: string }[]) ?? []).filter((r) => r.at >= dayStartIso))
        .reduce((a, r) => a + r.ml, 0)
    );
  }, [supabase, family.id, isParent, dayKey]);

  useEffect(() => {
    load();
  }, [load]);
  useRealtime(supabase, "feeds", family.id, load);
  useRealtime(supabase, "expressing_logs", family.id, load);
  useRealtime(supabase, "visit_slots", family.id, load);
  useRealtime(supabase, "sleep_windows", family.id, load);
  useRealtime(supabase, "feed_settings", family.id, load);

  const openFeed = feeds.find((f) => !f.ended_at);
  useEffect(() => {
    if (!openFeed) return;
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [openFeed]);

  const schedule = useMemo(
    () => computeSchedule(settings, feeds, windows, slots, new Date(), { pumping: true }),
    [settings, feeds, windows, slots]
  );
  const gaps = useMemo(() => computeGaps(settings), [settings]);
  const babyTimes = useMemo(() => babyFeedTimes(settings, slots), [settings, slots]);

  const pumpedToday = feeds.reduce((a, f) => a + (f.ml ?? 0), 0);
  const expressedToday = exprToday + pumpedToday;
  const babyNeedsPerDay = babyFeedsPerDay(settings) * (settings.baby_ml ?? 0);

  // ---- supply coach: 7-day average vs baby's need vs the evidence curve ----
  // Targets: coming-to-volume milestones (~350ml/d by day 6, 500 by day 8,
  // 750 by day 14) and the CHOP consensus band of 750–1000 ml/day by day 14 —
  // deliberately above a preemie's intake, because demand jumps later.
  const coach = (() => {
    const todayStr = dayKey;
    const completeDays = Object.entries(historyTotals)
      .filter(([d, ml]) => d !== todayStr && ml > 0)
      .map(([, ml]) => ml);
    const avg = completeDays.length
      ? Math.round(completeDays.reduce((a, b) => a + b, 0) / completeDays.length)
      : expressedToday || null;
    if (avg == null) return null;
    const dayN = dayNumber(family.baby_dob);
    const curveTarget =
      dayN <= 6 ? 350 : dayN <= 8 ? 500 : dayN <= 14 ? 500 + ((dayN - 8) / 6) * 250 : 750;
    let status: string;
    let advice: string;
    if (avg < Math.min(curveTarget * 0.8, babyNeedsPerDay || Infinity)) {
      status = "below the curve";
      advice = `Day ${dayN} milestone is ~${Math.round(curveTarget)} ml/day. Worth asking the lactation team about extra or longer sessions (power pumping) — small changes now protect supply for when ${family.baby_name.split(" ")[0]}'s needs jump.`;
    } else if (avg <= 1000) {
      status = "on track";
      advice =
        babyNeedsPerDay && avg > babyNeedsPerDay
          ? `~${avg - babyNeedsPerDay} ml/day beyond her current need is going to the stash — that's the plan working, not oversupply. Research targets 750–1000 ml/day by day 14 because her demand will rise.`
          : `Right in the healthy band for day ${dayN}. Keep the rhythm going.`;
    } else if (dayN <= 14) {
      // building phase: never suggest reducing before the day-14 target is set
      status = "strong supply";
      advice = `Brilliant output for day ${dayN} — and this is NOT the time to reduce anything. The first fortnight sets your long-term ceiling; keep every session, pump to comfort, and bank the stash.`;
    } else if (dayN <= 42) {
      // calibration phase (~6 weeks): protect supply, manage comfort only
      status = "above the band";
      advice = `Output is above the 750–1000 band. Supply is still calibrating until around 6 weeks, so hold the session count — if engorgement or blocked ducts are a problem, ask the team about pumping to comfort rather than dropping sessions.`;
    } else {
      status = "above the band";
      advice = `Sustained output over ~1000 ml/day with supply now established. If it's causing engorgement or blocked ducts, agree a gradual wind-down with the team — never cut sessions abruptly (mastitis risk). If it's comfortable, the freezer stash is gold.`;
    }
    return { avg, dayN, curveTarget: Math.round(curveTarget), status, advice, days: completeDays.length };
  })();

  if (!isParent) {
    return (
      <section>
        <div className="card">
          <div className="empty">This one&apos;s just for mum &amp; dad.</div>
        </div>
      </section>
    );
  }

  // a specific calendar day + time (local) → ISO — for back-logging past days
  function atOn(dateStr: string, hhmm: string): string {
    return new Date(`${dateStr}T${hhmm}`).toISOString();
  }

  async function startFeed() {
    setErr("");
    const { error } = await supabase.from("feeds").insert({
      family_id: family.id,
      fed_by: profile.id,
      started_at: new Date().toISOString(),
      method: "pump",
    });
    if (error) setErr(error.message);
    load();
  }

  async function finishFeed() {
    if (!openFeed) return;
    setErr("");
    const ml = finishMl ? parseFloat(finishMl) : null;
    if (ml !== null && (isNaN(ml) || ml < 0 || ml > 500)) {
      setErr("Millilitres should be a number like 40.");
      return;
    }
    const { error } = await supabase
      .from("feeds")
      .update({ ended_at: new Date().toISOString(), ml, method: finishMethod })
      .eq("id", openFeed.id);
    if (error) setErr(error.message);
    setFinishMl("");
    load();
  }

  async function logPastFeed(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!pastDate || !pastTime) return;
    const L = pastLeft.trim() ? parseInt(pastLeft, 10) : null;
    const R = pastRight.trim() ? parseInt(pastRight, 10) : null;
    const hasSplit = L != null || R != null;
    // a left/right split sets the total; otherwise use the single amount
    const ml = hasSplit ? (L ?? 0) + (R ?? 0) : pastMl.trim() ? parseFloat(pastMl) : null;
    const at = atOn(pastDate, pastTime);
    const mins = pastMins.trim() ? parseInt(pastMins, 10) : null;
    const ended = mins && mins > 0 ? new Date(+new Date(at) + mins * 60000).toISOString() : at;
    const { error } = await supabase.from("feeds").insert({
      family_id: family.id,
      fed_by: profile.id,
      started_at: at,
      ended_at: ended,
      ml,
      ml_left: L,
      ml_right: R,
      method: pastMethod,
    });
    if (error) {
      setErr(error.message);
      return;
    }
    setShowPast(false);
    setPastDate(todayKey());
    setPastTime("");
    setPastMl("");
    setPastLeft("");
    setPastRight("");
    setPastMins("");
    load();
  }

  function beginEdit(f: FeedRecord) {
    setEditId(f.id);
    setEditTime(fmtHM(new Date(f.started_at)));
    setEditMl(f.ml != null ? String(f.ml) : "");
    setEditMethod(f.method);
  }

  async function saveEdit() {
    if (!editId) return;
    setErr("");
    const rec = feeds.find((f) => f.id === editId);
    if (!rec) return;
    const ml = editMl ? parseFloat(editMl) : null;
    // the edited time stays on the session's ORIGINAL calendar day — around
    // midnight "today's date" and the record's date can differ
    const at = new Date(rec.started_at);
    const [h, m] = editTime.split(":").map(Number);
    at.setHours(h, m, 0, 0);
    const { error } = await supabase
      .from("feeds")
      .update({ started_at: at.toISOString(), ml, method: editMethod })
      .eq("id", editId);
    if (error) setErr(error.message);
    setEditId(null);
    load();
  }

  async function deleteFeed(id: string) {
    await supabase.from("feeds").delete().eq("id", id);
    setEditId(null);
    load();
  }

  async function logExpressing(e: React.FormEvent) {
    e.preventDefault();
    const ml = parseFloat(exprMl);
    if (isNaN(ml) || ml <= 0) return;
    await supabase.from("expressing_logs").insert({ family_id: family.id, logged_by: profile.id, ml });
    setExprMl("");
    load();
  }

  async function saveSettings(next: Partial<FeedSettingsRow>) {
    setErr("");
    const merged = { ...settings, ...next };
    setSettings(merged); // optimistic — schedule recomputes immediately
    const { error } = await supabase
      .from("feed_settings")
      .upsert({ family_id: family.id, ...merged, updated_at: new Date().toISOString() });
    if (error) {
      setErr("Plan didn't save: " + error.message);
      load(); // resync with what the DB actually holds
      return;
    }
    // keep a history of plan changes (ml creeping up as she grows, etc.)
    await supabase
      .from("feed_plan_history")
      .insert({
        family_id: family.id,
        changed_by: profile.id,
        baby_interval_min: merged.baby_interval_min ?? null,
        baby_ml: merged.baby_ml ?? null,
        feeds_per_day: merged.feeds_per_day ?? null,
        interval_night_min: merged.interval_night_min ?? null,
        target_ml: merged.target_ml ?? null,
      })
      .then(() => {}); // history is best-effort
  }

  async function addWindow(
    person: "mum" | "dad",
    kind: "sleep" | "meal",
    start_time: string,
    end_time: string
  ) {
    if (!start_time || !end_time) return;
    setErr("");
    const { error } = await supabase
      .from("sleep_windows")
      .insert({ family_id: family.id, person, kind, start_time, end_time });
    if (error) setErr("Window didn't save: " + error.message);
    load();
  }

  async function removeWindow(id: string) {
    setErr("");
    const { error } = await supabase.from("sleep_windows").delete().eq("id", id);
    if (error) setErr("Couldn't remove that window: " + error.message);
    load();
  }

  const elapsed = openFeed ? Math.floor((Date.now() - +new Date(openFeed.started_at)) / 1000) : 0;
  void tick;

  const calUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/api/calendar/${family.calendar_token}`;
  const feedById = (id: string) => feeds.find((f) => f.id === id);

  // when a left/right split is being entered, the total is derived and locked
  const pastSplit = pastLeft.trim() !== "" || pastRight.trim() !== "";
  const pastSplitTotal = (parseInt(pastLeft || "0", 10) || 0) + (parseInt(pastRight || "0", 10) || 0);

  return (
    <section>
      {/* baby's ward-set feeds */}
      <div className="card">
        <h2>{family.baby_name}&apos;s feeds <span className="muted">· set by the unit</span></h2>
        {!settings.baby_interval_min ? (
          <p className="note">
            Add the unit&apos;s plan under <b>Edit the plan</b> below (how often + ml) and her daily needs appear here.
          </p>
        ) : (
          <p style={{ fontWeight: 600 }}>
            🍼 every {Math.round((settings.baby_interval_min / 60) * 10) / 10}h · {settings.baby_ml ?? "?"} ml each ·{" "}
            {babyFeedsPerDay(settings)} feeds ≈ <b>{babyNeedsPerDay || "?"} ml/day</b>
          </p>
        )}
      </div>

      {/* pump timer */}
      <div className="card">
        <h2>Pump timer</h2>
        {openFeed ? (
          <>
            <div className="timer">
              {String(Math.floor(elapsed / 60)).padStart(2, "0")}:{String(elapsed % 60).padStart(2, "0")}
              <span className="muted"> since {fmtHM(new Date(openFeed.started_at))}</span>
            </div>
            <div className="row rowwrap" style={{ marginTop: 10 }}>
              <div>
                <label htmlFor="fin-ml">Amount (ml)</label>
                <input id="fin-ml" type="text" inputMode="decimal" value={finishMl} onChange={(e) => setFinishMl(e.target.value)} placeholder={settings.target_ml ? String(settings.target_ml) : "60"} />
              </div>
              <div>
                <label htmlFor="fin-method">How</label>
                <MethodSelect id="fin-method" value={finishMethod} onChange={setFinishMethod} />
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <button className="primary" onClick={finishFeed}>Finish</button>
            </div>
          </>
        ) : (
          <>
            <p className="note">Starting the timer logs the pump and re-plans the rest of today&apos;s sessions.</p>
            <div className="row rowwrap">
              <button className="primary" onClick={startFeed} style={{ flex: "0 0 auto" }}>Start pumping now</button>
              <PowerPumpButton />
              <button
                className="ghost"
                style={{ flex: "0 0 auto" }}
                onClick={() => {
                  // re-default the day every time the form opens — the tab can
                  // sit mounted across midnight, and a stale default quietly
                  // files an overnight pump under the previous day
                  if (!showPast) setPastDate(todayKey());
                  setShowPast(!showPast);
                }}
              >
                Log a past one
              </button>
            </div>
            <p className="muted" style={{ marginTop: 6 }}>
              Power pump runs an hour of pump/rest intervals to nudge supply up.
            </p>
            {showPast && (
              <form onSubmit={logPastFeed} style={{ marginTop: 10 }}>
                <div className="row rowwrap">
                  <div>
                    <label htmlFor="pf-d">Day</label>
                    <input id="pf-d" type="date" value={pastDate} max={todayKey()} onChange={(e) => setPastDate(e.target.value)} required />
                  </div>
                  <div>
                    <label htmlFor="pf-t">Time</label>
                    <input id="pf-t" type="time" value={pastTime} onChange={(e) => setPastTime(e.target.value)} required />
                  </div>
                  <div>
                    <label htmlFor="pf-min">Minutes</label>
                    <input id="pf-min" type="text" inputMode="numeric" value={pastMins} onChange={(e) => setPastMins(e.target.value)} placeholder="15" />
                  </div>
                </div>
                <div className="row rowwrap" style={{ marginTop: 10 }}>
                  <div>
                    <label htmlFor="pf-l">Left (ml)</label>
                    <input id="pf-l" type="text" inputMode="numeric" value={pastLeft} onChange={(e) => setPastLeft(e.target.value)} placeholder="30" />
                  </div>
                  <div>
                    <label htmlFor="pf-r">Right (ml)</label>
                    <input id="pf-r" type="text" inputMode="numeric" value={pastRight} onChange={(e) => setPastRight(e.target.value)} placeholder="30" />
                  </div>
                  <div>
                    <label htmlFor="pf-ml">{pastSplit ? "Total (ml)" : "Amount (ml)"}</label>
                    <input
                      id="pf-ml"
                      type="text"
                      inputMode="decimal"
                      value={pastSplit ? String(pastSplitTotal) : pastMl}
                      onChange={(e) => setPastMl(e.target.value)}
                      disabled={pastSplit}
                      placeholder="60"
                    />
                  </div>
                </div>
                <div className="row rowwrap" style={{ marginTop: 10 }}>
                  <div>
                    <label htmlFor="pf-m">How</label>
                    <MethodSelect id="pf-m" value={pastMethod} onChange={setPastMethod} />
                  </div>
                </div>
                <p className="muted" style={{ marginTop: 6 }}>
                  Split left/right if you like — or just put the total in. Minutes is optional.
                </p>
                <button className="ghost" style={{ marginTop: 10 }} type="submit">Save</button>
              </form>
            )}
          </>
        )}
        {err && <p className="err">{err}</p>}
      </div>

      {/* today's pumping grid */}
      <div className="card">
        <h2>Your pumping today</h2>
        <p className="muted" style={{ marginBottom: 6 }}>
          Day gaps ≈ {Math.round(gaps.dayGap / 6) / 10}h · overnight {Math.round(gaps.nightGap / 6) / 10}h
          {schedule.some((s) => s.at.getDate() !== new Date().getDate()) && (
            <> · <b>+1</b> = after midnight, still tonight&apos;s plan</>
          )}
        </p>
        {schedule.length === 0 ? (
          <div className="empty">Start the first pump and today&apos;s plan appears here.</div>
        ) : (
          schedule.map((s, i) => {
            const rec = s.logged ? feeds.find((f) => Math.abs(+new Date(f.started_at) - +s.at) < 1000) : undefined;
            const isEditing = rec && editId === rec.id;
            return (
              <div key={i} className={`feedrow ${s.logged ? "done" : ""}`}>
                {isEditing ? (
                  <div className="row rowwrap" style={{ flex: 1, alignItems: "flex-end" }}>
                    <div>
                      <label>Time</label>
                      <input type="time" value={editTime} onChange={(e) => setEditTime(e.target.value)} />
                    </div>
                    <div>
                      <label>ml</label>
                      <input type="text" inputMode="decimal" value={editMl} onChange={(e) => setEditMl(e.target.value)} />
                    </div>
                    <div>
                      <label>How</label>
                      <MethodSelect value={editMethod} onChange={setEditMethod} />
                    </div>
                    <button type="button" className="ghost" style={{ flex: "0 0 auto" }} onClick={saveEdit}>Save</button>
                    <button type="button" className="tiny" style={{ flex: "0 0 auto" }} onClick={() => rec && deleteFeed(rec.id)}>delete</button>
                  </div>
                ) : (
                  <>
                    <span className="t">
                      {s.logged ? "✓" : "·"} {fmtHM(s.at)}
                      {s.power && <span aria-hidden="true"> 💪</span>}
                      {s.at.getDate() !== new Date().getDate() && (
                        <span className="muted" style={{ fontWeight: 600 }}> +1</span>
                      )}
                    </span>
                    <span className="info" style={{ flex: 1 }}>
                      {s.logged
                        ? [
                            s.power ? "power pump" : null,
                            rec && rec.method !== "pump" ? rec.method : null,
                            s.ml != null ? `${s.ml} ml` : "logged",
                            rec?.ml != null && settings.target_ml && rec.ml < settings.target_ml
                              ? "⚠ under minimum"
                              : null,
                          ].filter(Boolean).join(" · ")
                        : [
                            s.power ? "power pump — fixed, use the 💪 button" : null,
                            s.assigned === "pre-sleep"
                              ? "last one before Mum's sleep 😴"
                              : s.assigned === "post-sleep"
                                ? "first one after waking ☀️"
                                : s.assigned === "pre-meal"
                                  ? "before Mum's break 🍽"
                                  : s.assigned === "post-meal"
                                    ? "after Mum's break 🍽"
                                    : null,
                            s.duringVisit ? (s.duringVisit === "free slot" ? "during an open slot" : `during ${s.duringVisit}'s visit`) : null,
                          ].filter(Boolean).join(" · ") || "planned"}
                    </span>
                    {s.logged && rec && (
                      <button type="button" className="tiny" onClick={() => beginEdit(rec)}>edit</button>
                    )}
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* supply vs demand */}
      <div className="card">
        <h2>Supply &amp; demand today</h2>
        <div className="supply">
          <div>
            <div className="big">{babyNeedsPerDay || "—"} ml</div>
            <div className="muted">{family.baby_name.split(" ")[0]} needs / day</div>
          </div>
          <div>
            <div className="big">{expressedToday} ml</div>
            <div className="muted">you&apos;ve expressed</div>
          </div>
          <div>
            <div className="big" style={{ color: expressedToday - babyNeedsPerDay >= 0 ? "var(--sage)" : "var(--rose-deep)" }}>
              {expressedToday - babyNeedsPerDay >= 0 ? "+" : ""}{expressedToday - babyNeedsPerDay} ml
            </div>
            <div className="muted">vs her day&apos;s needs</div>
          </div>
        </div>
        <form className="row" style={{ marginTop: 10 }} onSubmit={logExpressing}>
          <input type="text" inputMode="decimal" value={exprMl} onChange={(e) => setExprMl(e.target.value)} placeholder="Quick-log expressed ml…" aria-label="Expressed millilitres" />
          <button className="ghost" style={{ flex: "0 0 auto" }} type="submit">Add</button>
        </form>
        {coach && (
          <div className="coach">
            <div className="coachline">
              <span className="badge" style={{
                background: coach.status === "on track" ? "var(--sage)" : coach.status === "below the curve" ? "var(--rose)" : "var(--sky)",
                color: "#fff",
              }}>
                {coach.status}
              </span>{" "}
              <b>{coach.avg} ml/day</b>
              <span className="muted">
                {" "}avg{coach.days ? ` over ${coach.days} day${coach.days > 1 ? "s" : ""}` : " (today so far)"} · day-{coach.dayN} milestone ~{coach.curveTarget} ml
              </span>
            </div>
            <p className="muted" style={{ marginTop: 6 }}>{coach.advice}</p>
          </div>
        )}
        <p className="muted" style={{ marginTop: 8 }}>
          Guidance here follows published NICU lactation targets — any change to your plan is still a decision with your unit.
        </p>
      </div>

      <PumpHistory supabase={supabase} familyId={family.id} />

      <PumpDays supabase={supabase} familyId={family.id} />

      <TopBreast supabase={supabase} familyId={family.id} />

      <PumpLog supabase={supabase} familyId={family.id} />

      {/* plan & sleep settings */}
      <div className="card">
        <h2>Plan &amp; protected sleep</h2>
        {!showPlan ? (
          <button className="ghost" onClick={() => setShowPlan(true)}>Edit the plan</button>
        ) : (
          <>
            <h3>{family.baby_name.split(" ")[0]}&apos;s feeds (unit&apos;s plan)</h3>
            <div className="row rowwrap">
              <div>
                <label>How often</label>
                <select value={settings.baby_interval_min ?? 0} onChange={(e) => saveSettings({ baby_interval_min: +e.target.value || null })}>
                  <option value={0}>Not set</option>
                  <option value={120}>2-hourly</option>
                  <option value={180}>3-hourly</option>
                  <option value={240}>4-hourly</option>
                </select>
              </div>
              <div>
                <label>ml per feed</label>
                <input type="text" inputMode="decimal" defaultValue={settings.baby_ml ?? ""} onBlur={(e) => saveSettings({ baby_ml: e.target.value ? +e.target.value : null })} placeholder="40" />
              </div>
            </div>

            <h3>Your pumping</h3>
            <div className="row rowwrap">
              <div>
                <label>Minimum pumps in 24h</label>
                <select value={settings.feeds_per_day ?? 8} onChange={(e) => saveSettings({ feeds_per_day: +e.target.value })}>
                  {[6, 7, 8, 9, 10, 11, 12].map((n) => (
                    <option key={n} value={n}>{n} pumps</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Longest overnight gap</label>
                <select value={settings.interval_night_min ?? 240} onChange={(e) => saveSettings({ interval_night_min: +e.target.value })}>
                  <option value={180}>3 hours</option>
                  <option value={210}>3½ hours</option>
                  <option value={240}>4 hours</option>
                </select>
              </div>
            </div>
            <div className="row rowwrap">
              <div>
                <label>Day starts</label>
                <input type="time" value={settings.day_from.slice(0, 5)} onChange={(e) => saveSettings({ day_from: e.target.value })} />
              </div>
              <div>
                <label>Night starts</label>
                <input type="time" value={settings.night_from.slice(0, 5)} onChange={(e) => saveSettings({ night_from: e.target.value })} />
              </div>
              <div>
                <label>Minimum ml/pump</label>
                <input type="text" inputMode="decimal" defaultValue={settings.target_ml ?? ""} onBlur={(e) => saveSettings({ target_ml: e.target.value ? +e.target.value : null })} placeholder="60" />
              </div>
            </div>
            <p className="muted" style={{ marginTop: 6 }}>
              Pump gaps work out at ≈ {Math.round(gaps.dayGap / 6) / 10}h by day with this plan.
            </p>

            <SleepWindows
              title="Mum's protected sleep"
              icon="😴"
              windows={windows.filter((w) => w.person === "mum" && (w.kind ?? "sleep") === "sleep")}
              onAdd={(s, e) => addWindow("mum", "sleep", s, e)}
              onRemove={removeWindow}
            />
            <SleepWindows
              title="Mum's meal breaks"
              icon="🍽"
              windows={windows.filter((w) => w.person === "mum" && w.kind === "meal")}
              onAdd={(s, e) => addWindow("mum", "meal", s, e)}
              onRemove={removeWindow}
            />
            <SleepWindows
              title="Dad's protected sleep"
              icon="😴"
              windows={windows.filter((w) => w.person === "dad" && (w.kind ?? "sleep") === "sleep")}
              onAdd={(s, e) => addWindow("dad", "sleep", s, e)}
              onRemove={removeWindow}
            />
            {err && <p className="err">{err}</p>}
            <button className="tiny" style={{ marginTop: 8 }} onClick={() => setShowPlan(false)}>Done</button>
          </>
        )}
      </div>

      {/* calendar */}
      <div className="card">
        <h2>Shared calendar</h2>
        <p className="note">
          Subscribe once in Google or Apple Calendar and today&apos;s feeds, sleep windows and visits stay up to date for everyone.
        </p>
        <input type="text" readOnly value={calUrl} onFocus={(e) => e.target.select()} aria-label="Calendar subscription link" />
        <button className="ghost" style={{ marginTop: 8 }} onClick={() => navigator.clipboard?.writeText(calUrl)}>
          Copy link
        </button>
        <p className="muted" style={{ marginTop: 8 }}>
          Google: Other calendars → From URL. iPhone: Settings → Calendar → Accounts → Add Subscribed Calendar.
        </p>
      </div>
    </section>
  );
}

function SleepWindows({
  title,
  icon,
  windows,
  onAdd,
  onRemove,
}: {
  title: string;
  icon: string;
  windows: SleepWindowRow[];
  onAdd: (start: string, end: string) => void;
  onRemove: (id: string) => void;
}) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  return (
    <div style={{ marginTop: 10 }}>
      <label>{title}</label>
      {windows.map((w) => (
        <div key={w.id} className="sleeprow">
          <span>{icon} {w.start_time.slice(0, 5)} – {w.end_time.slice(0, 5)}</span>
          <button type="button" className="tiny" onClick={() => w.id && onRemove(w.id)} aria-label={`Remove ${title} window`}>✕</button>
        </div>
      ))}
      <div className="row rowwrap" style={{ alignItems: "flex-end" }}>
        <div>
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} aria-label={`${title} from`} />
        </div>
        <div>
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} aria-label={`${title} until`} />
        </div>
        <button
          type="button"
          className="ghost"
          style={{ flex: "0 0 auto" }}
          onClick={() => {
            onAdd(start, end);
            setStart("");
            setEnd("");
          }}
        >
          Add window
        </button>
      </div>
    </div>
  );
}

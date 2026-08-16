"use client";
// Visits — parents open/delete slots; family books a free slot or cancels
// their own. Grouped by date, upcoming only.
import { useCallback, useEffect, useState } from "react";
import { useFamily } from "@/components/FamilyProvider";
import { useRealtime } from "@/lib/useRealtime";
import { todayKey, fmtDate, fmtTime, isoWeekKey, dayName } from "@/lib/dates";
import { presenceFor } from "@/lib/presence";
import { BLOCKS, type Profile, type VisitSlot, type ShiftAssignee, type ShiftBlock } from "@/lib/types";

type VisitRequest = {
  id: string;
  requested_by: string;
  req_date: string;
  start_time: string;
  end_time: string;
  note: string | null;
  status: "pending" | "approved" | "declined";
  requester?: { display_name: string } | null;
};

export default function VisitsTab() {
  const { supabase, profile, family, isParent } = useFamily();
  const [slots, setSlots] = useState<VisitSlot[] | null>(null);
  const [date, setDate] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [repeat, setRepeat] = useState<"none" | "daily" | "weekdays" | "weekends">("none");
  const [until, setUntil] = useState("");
  const [spaces, setSpaces] = useState(3);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [notice, setNotice] = useState("");
  const [members, setMembers] = useState<Profile[]>([]);
  const [bookingFor, setBookingFor] = useState<string | null>(null); // slot id with picker open
  const [guestName, setGuestName] = useState("");
  const [rota, setRota] = useState<Record<string, ShiftAssignee>>({});
  const [requests, setRequests] = useState<VisitRequest[]>([]);
  const [reqDate, setReqDate] = useState("");
  const [reqFrom, setReqFrom] = useState("");
  const [reqTo, setReqTo] = useState("");
  const [reqNote, setReqNote] = useState("");
  const [reqMsg, setReqMsg] = useState("");
  const [showReq, setShowReq] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("visit_slots")
      .select("*, booker:profiles!visit_slots_booked_by_fkey(id, display_name)")
      .eq("family_id", family.id)
      .gte("slot_date", todayKey())
      .order("slot_date")
      .order("start_time");
    setSlots((data as VisitSlot[]) ?? []);
  }, [supabase, family.id]);

  useEffect(() => {
    load();
  }, [load]);
  useRealtime(supabase, "visit_slots", family.id, load);

  const loadRequests = useCallback(async () => {
    const { data } = await supabase
      .from("visit_requests")
      .select("id, requested_by, req_date, start_time, end_time, note, status, requester:profiles!visit_requests_requested_by_fkey(display_name)")
      .eq("family_id", family.id)
      .gte("req_date", todayKey())
      .order("req_date")
      .order("start_time");
    setRequests((data as unknown as VisitRequest[]) ?? []);
  }, [supabase, family.id]);
  useEffect(() => {
    loadRequests();
  }, [loadRequests]);
  useRealtime(supabase, "visit_requests", family.id, loadRequests);

  // family: ask for a time
  async function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    setReqMsg("");
    if (!reqDate || !reqFrom || !reqTo) return;
    const { error } = await supabase.from("visit_requests").insert({
      family_id: family.id,
      requested_by: profile.id,
      req_date: reqDate,
      start_time: reqFrom,
      end_time: reqTo,
      note: reqNote.trim() || null,
    });
    if (error) {
      setReqMsg(
        error.message.includes("vreq_times")
          ? "The end time needs to be after the start."
          : /visit_requests/.test(error.message)
            ? "Requests aren't switched on in the database yet — migration 027."
            : error.message
      );
      return;
    }
    setReqDate("");
    setReqFrom("");
    setReqTo("");
    setReqNote("");
    setShowReq(false);
    setReqMsg("Sent — you'll hear once it's approved. 💛");
    loadRequests();
  }

  async function cancelRequest(r: VisitRequest) {
    await supabase.from("visit_requests").delete().eq("id", r.id);
    loadRequests();
  }

  // parents: approve = open a slot at that time and book them straight in
  // (the slot-booking notification tells everyone); decline is quiet.
  async function approveRequest(r: VisitRequest) {
    const { data: slot, error } = await supabase
      .from("visit_slots")
      .insert({
        family_id: family.id,
        slot_date: r.req_date,
        start_time: r.start_time,
        end_time: r.end_time,
      })
      .select("id")
      .single();
    if (error || !slot) {
      alert(error?.message ?? "Couldn't open the slot.");
      return;
    }
    await supabase.from("visit_slots").update({ booked_by: r.requested_by }).eq("id", slot.id);
    await supabase.from("visit_requests").update({ status: "approved" }).eq("id", r.id);
    load();
    loadRequests();
  }

  async function declineRequest(r: VisitRequest) {
    await supabase.from("visit_requests").update({ status: "declined" }).eq("id", r.id);
    loadRequests();
  }

  // who's at the hospital each day, from the Rest rota (family can read it too)
  const loadRota = useCallback(async () => {
    const weeks = Array.from(new Set((slots ?? []).map((s) => isoWeekKey(s.slot_date))));
    if (!weeks.length) {
      setRota({});
      return;
    }
    const { data } = await supabase
      .from("shift_blocks")
      .select("week_key, day_name, block_name, assignee")
      .eq("family_id", family.id)
      .in("week_key", weeks);
    const map: Record<string, ShiftAssignee> = {};
    for (const r of (data as ShiftBlock[]) ?? [])
      map[`${r.week_key}-${r.day_name}-${r.block_name}`] = r.assignee;
    setRota(map);
  }, [supabase, family.id, slots]);
  useEffect(() => {
    loadRota();
  }, [loadRota]);
  useRealtime(supabase, "shift_blocks", family.id, loadRota);

  // who's on for each of a day's AM/PM/Eve blocks — lines up with the rota
  // grid. null until the week's rota has been set, so it never over-claims.
  const dayBlocks = (dateStr: string) => {
    const wk = isoWeekKey(dateStr);
    if (!Object.keys(rota).some((k) => k.startsWith(`${wk}-`))) return null;
    const dn = dayName(dateStr);
    return BLOCKS.map((b) => ({ block: b, who: presenceFor(rota[`${wk}-${dn}-${b}`] ?? "both") }));
  };

  // parents can book someone in — load the family list for the picker
  useEffect(() => {
    if (!isParent) return;
    supabase
      .from("profiles")
      .select("id, display_name, role")
      .eq("family_id", family.id)
      .neq("role", "team")
      .order("display_name")
      .then(({ data }) => setMembers((data as Profile[]) ?? []));
  }, [isParent, supabase, family.id]);

  async function addSlot(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setMsg("");
    if (!date || !from || !to) return;

    // build the list of dates: one, or a repeated run (capped at 31 days)
    const dates: string[] = [];
    if (repeat === "none") {
      dates.push(date);
    } else {
      if (!until) {
        setErr("Pick an end date for the repeat.");
        return;
      }
      if (until < date) {
        setErr("The repeat end date is before the start date.");
        return;
      }
      const d = new Date(date + "T12:00:00");
      const end = new Date(until + "T12:00:00");
      let guard = 0;
      while (d <= end && guard++ < 31) {
        const dow = d.getDay();
        const keep =
          repeat === "daily" ||
          (repeat === "weekdays" && dow >= 1 && dow <= 5) ||
          (repeat === "weekends" && (dow === 0 || dow === 6));
        if (keep) {
          dates.push(
            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
          );
        }
        d.setDate(d.getDate() + 1);
      }
      if (!dates.length) {
        setErr("No days match that repeat in the range you picked.");
        return;
      }
    }

    // one row per space, per date — a "space" is a bookable spot at that time
    const rows = dates.flatMap((slot_date) =>
      Array.from({ length: spaces }, () => ({
        family_id: family.id,
        slot_date,
        start_time: from,
        end_time: to,
      }))
    );
    const { error } = await supabase.from("visit_slots").insert(rows);
    if (error) {
      setErr(
        error.message.includes("end_time")
          ? "The end time needs to be after the start time."
          : error.message
      );
      return;
    }
    const spaceNote = spaces > 1 ? ` (${spaces} spaces each)` : "";
    setMsg(dates.length > 1 ? `Opened ${dates.length} slots${spaceNote}.` : `Slot opened${spaceNote}.`);
    setDate("");
    setFrom("");
    setTo("");
    setRepeat("none");
    setUntil("");
    setSpaces(1);
    load();
  }

  // "that space just filled" — shown when a booking loses a race with another
  // phone (or a stale view), so nobody's booking silently gets overwritten
  const TAKEN = "That space was just taken by someone else — showing the latest.";

  async function toggleBooking(slot: VisitSlot) {
    setNotice("");
    const mine = slot.booked_by === profile.id;
    if (slot.booked_by && !mine) return;
    if (mine) {
      const { error } = await supabase
        .from("visit_slots")
        .update({ booked_by: null })
        .eq("id", slot.id);
      if (error) alert(error.message);
      load();
      return;
    }
    // book a free space — only if it is *still* free in the database, so two
    // people (or a stale screen) can't overwrite each other's booking
    const { data, error } = await supabase
      .from("visit_slots")
      .update({ booked_by: profile.id })
      .eq("id", slot.id)
      .is("booked_by", null)
      .is("booked_name", null)
      .select("id");
    if (error) alert(error.message);
    else if (!data || data.length === 0) setNotice(TAKEN);
    load();
  }

  // parents only: book a chosen family member into a free slot
  async function bookMemberIn(slot: VisitSlot, memberId: string) {
    setNotice("");
    const { data, error } = await supabase
      .from("visit_slots")
      .update({ booked_by: memberId, booked_name: null })
      .eq("id", slot.id)
      .is("booked_by", null)
      .is("booked_name", null)
      .select("id");
    if (error) alert(error.message);
    else if (!data || data.length === 0) setNotice(TAKEN);
    setBookingFor(null);
    load();
  }

  // parents only: book a non-member visitor by name
  async function bookGuestIn(slot: VisitSlot) {
    setNotice("");
    const name = guestName.trim();
    if (!name) return;
    const { data, error } = await supabase
      .from("visit_slots")
      .update({ booked_name: name, booked_by: null })
      .eq("id", slot.id)
      .is("booked_by", null)
      .is("booked_name", null)
      .select("id");
    if (error) alert(error.message);
    else if (!data || data.length === 0) setNotice(TAKEN);
    setBookingFor(null);
    setGuestName("");
    load();
  }

  async function unbook(slot: VisitSlot) {
    const { error } = await supabase
      .from("visit_slots")
      .update({ booked_by: null, booked_name: null })
      .eq("id", slot.id);
    if (error) alert(error.message);
    load();
  }

  async function removeSlot(slot: VisitSlot) {
    await supabase.from("visit_slots").delete().eq("id", slot.id);
    load();
  }

  // delete every space at a time
  async function removeGroup(groupSlots: VisitSlot[]) {
    await supabase
      .from("visit_slots")
      .delete()
      .in("id", groupSlots.map((s) => s.id));
    load();
  }

  const slotBadge = (s: VisitSlot) =>
    s.booked_by === profile.id ? "You" : s.booker?.display_name ?? s.booked_name ?? "Booked";

  // group by date, then by time — each time-group is one visiting window with
  // one-or-more bookable spaces
  const grouped: { date: string; groups: { key: string; slots: VisitSlot[] }[] }[] = [];
  for (const s of slots ?? []) {
    let day = grouped.find((x) => x.date === s.slot_date);
    if (!day) {
      day = { date: s.slot_date, groups: [] };
      grouped.push(day);
    }
    const key = `${s.start_time}-${s.end_time}`;
    const grp = day.groups.find((g) => g.key === key);
    if (grp) grp.slots.push(s);
    else day.groups.push({ key, slots: [s] });
  }

  return (
    <section>
      {isParent && (
        <form className="card" onSubmit={addSlot}>
          <h2>Open a visiting slot</h2>
          <p className="note">
            Only slots you open here can be booked — visits only happen when
            they suit you.
          </p>
          <div className="row rowwrap">
            <div>
              <label htmlFor="vs-date">Date</label>
              <input
                id="vs-date"
                type="date"
                value={date}
                min={todayKey()}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="vs-from">From</label>
              <input
                id="vs-from"
                type="time"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="vs-to">To</label>
              <input
                id="vs-to"
                type="time"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="row rowwrap" style={{ marginTop: 10 }}>
            <div>
              <label htmlFor="vs-repeat">Repeat</label>
              <select
                id="vs-repeat"
                value={repeat}
                onChange={(e) => setRepeat(e.target.value as typeof repeat)}
              >
                <option value="none">Just this day</option>
                <option value="daily">Every day</option>
                <option value="weekdays">Weekdays</option>
                <option value="weekends">Weekends</option>
              </select>
            </div>
            {repeat !== "none" && (
              <div>
                <label htmlFor="vs-until">Until</label>
                <input
                  id="vs-until"
                  type="date"
                  value={until}
                  min={date || todayKey()}
                  onChange={(e) => setUntil(e.target.value)}
                />
              </div>
            )}
            <div>
              <label htmlFor="vs-spaces">Spaces</label>
              <select
                id="vs-spaces"
                value={spaces}
                onChange={(e) => setSpaces(+e.target.value)}
              >
                <option value={1}>1 person</option>
                <option value={2}>2 people</option>
                <option value={3}>3 people</option>
              </select>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <button className="primary" type="submit">
              {repeat === "none" ? "Open slot" : "Open slots"}
            </button>
          </div>
          {err && <p className="err">{err}</p>}
          {msg && <p className="muted" style={{ marginTop: 8 }}>{msg}</p>}
        </form>
      )}

      {isParent && requests.some((r) => r.status === "pending") && (
        <div className="card">
          <h2>Visit requests</h2>
          <p className="note">Approving opens a slot at that time and books them straight in.</p>
          {requests
            .filter((r) => r.status === "pending")
            .map((r) => (
              <div key={r.id} className="slot">
                <div style={{ flex: 1 }}>
                  <b>{r.requester?.display_name ?? "Someone"}</b>{" "}
                  <span className="t">
                    {fmtDate(r.req_date)} · {fmtTime(r.start_time)} – {fmtTime(r.end_time)}
                  </span>
                  {r.note && <div className="muted">“{r.note}”</div>}
                </div>
                <button className="ghost" onClick={() => approveRequest(r)}>
                  Approve
                </button>
                <button className="tiny" onClick={() => declineRequest(r)}>
                  decline
                </button>
              </div>
            ))}
        </div>
      )}

      <div className="card">
        <h2>Visiting slots</h2>
        {!isParent && (
          <p className="note">
            Pick a free space and it&apos;s yours. Some slots fit more than one
            of you.
          </p>
        )}
        {notice && (
          <p className="note" role="status" style={{ borderColor: "var(--rose)" }}>
            {notice}
          </p>
        )}
        {slots === null ? null : slots.length === 0 ? (
          <div className="empty">No slots open yet — check back soon.</div>
        ) : (
          grouped.map((day) => (
            <div key={day.date}>
              <div className="datehead">
                <span className="datehead-d">{fmtDate(day.date)}</span>
                {(() => {
                  const blocks = dayBlocks(day.date);
                  return blocks ? (
                    <span className="daywho">
                      {blocks.map(({ block, who }) => (
                        <span key={block} className={`whoson whoson-${who.kind}`}>
                          {block} {who.short}
                        </span>
                      ))}
                    </span>
                  ) : null;
                })()}
              </div>
              {day.groups.map((grp) => {
                const capacity = grp.slots.length;
                const bookedSlots = grp.slots.filter((s) => s.booked_by || s.booked_name);
                const freeSlots = grp.slots.filter((s) => !s.booked_by && !s.booked_name);
                const mySlot = grp.slots.find((s) => s.booked_by === profile.id);
                const first = grp.slots[0];
                return (
                  <div key={grp.key}>
                    <div className="slot">
                      <div style={{ flex: 1 }}>
                        <span className="t">
                          {fmtTime(first.start_time)} – {fmtTime(first.end_time)}
                        </span>{" "}
                        {bookedSlots.map((s) => (
                          <span key={s.id} className="badge booked" style={{ marginRight: 4 }}>
                            {slotBadge(s)}
                            {isParent && (
                              <button
                                className="badge-x"
                                onClick={() => unbook(s)}
                                aria-label={`Unbook ${slotBadge(s)}`}
                              >
                                ✕
                              </button>
                            )}
                          </span>
                        ))}
                        {freeSlots.length > 0 && (
                          <span className="badge">
                            {freeSlots.length} free{capacity > 1 ? ` of ${capacity}` : ""}
                          </span>
                        )}
                        {freeSlots.length === 0 && capacity > 1 && (
                          <span className="badge">full</span>
                        )}
                      </div>
                      {freeSlots.length > 0 &&
                        (isParent ? (
                          <button
                            className="ghost"
                            onClick={() =>
                              setBookingFor(bookingFor === grp.key ? null : grp.key)
                            }
                          >
                            Book…
                          </button>
                        ) : !mySlot ? (
                          <button className="ghost" onClick={() => toggleBooking(freeSlots[0])}>
                            Book
                          </button>
                        ) : null)}
                      {mySlot && (
                        <button className="ghost" onClick={() => toggleBooking(mySlot)}>
                          Cancel
                        </button>
                      )}
                      {isParent && (
                        <button
                          className="tiny"
                          onClick={() => removeGroup(grp.slots)}
                          aria-label="Delete this slot"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    {isParent && bookingFor === grp.key && freeSlots.length > 0 && (
                      <div className="linkslots">
                        <span className="muted">Who&apos;s coming?</span>
                        {members.map((m) => (
                          <button
                            key={m.id}
                            className="ghost"
                            onClick={() => bookMemberIn(freeSlots[0], m.id)}
                          >
                            {m.id === profile.id ? "Me" : m.display_name}
                          </button>
                        ))}
                        <form
                          className="row"
                          style={{ flexBasis: "100%", marginTop: 4 }}
                          onSubmit={(e) => {
                            e.preventDefault();
                            bookGuestIn(freeSlots[0]);
                          }}
                        >
                          <input
                            type="text"
                            value={guestName}
                            onChange={(e) => setGuestName(e.target.value)}
                            placeholder="…or type a name (a friend, etc.)"
                            aria-label="Guest name"
                          />
                          <button className="ghost" style={{ flex: "0 0 auto" }} type="submit">
                            Book
                          </button>
                        </form>
                        <button className="tiny" onClick={() => setBookingFor(null)}>
                          not now
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {!isParent && profile.role === "family" && (
        <div className="card">
          <h2>Can&apos;t see a time that works?</h2>
          {!showReq ? (
            <button className="ghost" onClick={() => setShowReq(true)}>
              🙋 Request a visit time
            </button>
          ) : (
            <form onSubmit={submitRequest}>
              <p className="note">
                Suggest a day and time — Mum &amp; Dad get a nudge and can approve it with one tap.
              </p>
              <div className="row rowwrap">
                <div>
                  <label htmlFor="vr-d">Day</label>
                  <input id="vr-d" type="date" value={reqDate} min={todayKey()} onChange={(e) => setReqDate(e.target.value)} required />
                </div>
                <div>
                  <label htmlFor="vr-f">From</label>
                  <input id="vr-f" type="time" value={reqFrom} onChange={(e) => setReqFrom(e.target.value)} required />
                </div>
                <div>
                  <label htmlFor="vr-t">To</label>
                  <input id="vr-t" type="time" value={reqTo} onChange={(e) => setReqTo(e.target.value)} required />
                </div>
              </div>
              <label htmlFor="vr-n" style={{ marginTop: 8 }}>Note (optional)</label>
              <input id="vr-n" type="text" value={reqNote} onChange={(e) => setReqNote(e.target.value)} placeholder="e.g. after work, bringing Nana" />
              <div className="row" style={{ marginTop: 10 }}>
                <button className="primary" type="submit">Send request</button>
                <button type="button" className="ghost" style={{ flex: "0 0 auto" }} onClick={() => setShowReq(false)}>
                  Not now
                </button>
              </div>
            </form>
          )}
          {reqMsg && <p className="muted" style={{ marginTop: 8 }}>{reqMsg}</p>}
          {requests.filter((r) => r.requested_by === profile.id).length > 0 && (
            <div style={{ marginTop: 10 }}>
              {requests
                .filter((r) => r.requested_by === profile.id)
                .map((r) => (
                  <div key={r.id} className="slot">
                    <div style={{ flex: 1 }}>
                      <span className="t">
                        {fmtDate(r.req_date)} · {fmtTime(r.start_time)} – {fmtTime(r.end_time)}
                      </span>{" "}
                      <span className={`badge ${r.status === "approved" ? "booked" : ""}`}>
                        {r.status === "pending" ? "waiting" : r.status === "approved" ? "approved 🎉" : "couldn't this time"}
                      </span>
                    </div>
                    {r.status === "pending" && (
                      <button className="tiny" onClick={() => cancelRequest(r)}>
                        cancel
                      </button>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

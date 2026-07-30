"use client";
// Visits — parents open/delete slots; family books a free slot or cancels
// their own. Grouped by date, upcoming only.
import { useCallback, useEffect, useState } from "react";
import { useFamily } from "@/components/FamilyProvider";
import { useRealtime } from "@/lib/useRealtime";
import { todayKey, fmtDate, fmtTime } from "@/lib/dates";
import type { Profile, VisitSlot } from "@/lib/types";

export default function VisitsTab() {
  const { supabase, profile, family, isParent } = useFamily();
  const [slots, setSlots] = useState<VisitSlot[] | null>(null);
  const [date, setDate] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [repeat, setRepeat] = useState<"none" | "daily" | "weekdays" | "weekends">("none");
  const [until, setUntil] = useState("");
  const [spaces, setSpaces] = useState(1);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [members, setMembers] = useState<Profile[]>([]);
  const [bookingFor, setBookingFor] = useState<string | null>(null); // slot id with picker open
  const [guestName, setGuestName] = useState("");

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

  async function toggleBooking(slot: VisitSlot) {
    const mine = slot.booked_by === profile.id;
    if (slot.booked_by && !mine) return;
    const { error } = await supabase
      .from("visit_slots")
      .update({ booked_by: mine ? null : profile.id })
      .eq("id", slot.id);
    if (error) alert(error.message);
    load();
  }

  // parents only: book a chosen family member into a free slot
  async function bookMemberIn(slot: VisitSlot, memberId: string) {
    const { error } = await supabase
      .from("visit_slots")
      .update({ booked_by: memberId, booked_name: null })
      .eq("id", slot.id);
    if (error) alert(error.message);
    setBookingFor(null);
    load();
  }

  // parents only: book a non-member visitor by name
  async function bookGuestIn(slot: VisitSlot) {
    const name = guestName.trim();
    if (!name) return;
    const { error } = await supabase
      .from("visit_slots")
      .update({ booked_name: name, booked_by: null })
      .eq("id", slot.id);
    if (error) alert(error.message);
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
          <div className="row wrap">
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
          <div className="row wrap" style={{ marginTop: 10 }}>
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

      <div className="card">
        <h2>Visiting slots</h2>
        {!isParent && (
          <p className="note">
            Pick a free space and it&apos;s yours. Some slots fit more than one
            of you.
          </p>
        )}
        {slots === null ? null : slots.length === 0 ? (
          <div className="empty">No slots open yet — check back soon.</div>
        ) : (
          grouped.map((day) => (
            <div key={day.date}>
              <div className="datehead">{fmtDate(day.date)}</div>
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
    </section>
  );
}

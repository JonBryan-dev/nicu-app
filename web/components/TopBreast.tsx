"use client";
// TopBreast — a light-hearted leaderboard from the left/right split data: which
// side averages more per session, with a trophy sticker for the front-runner.
// Only counts sessions where BOTH sides were logged (a fair head-to-head), and
// stays gentle — both breasts are feeding the baby, it's just for fun.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useRealtime } from "@/lib/useRealtime";

type Row = { ml_left: number | null; ml_right: number | null };

export default function TopBreast({ supabase, familyId }: { supabase: SupabaseClient; familyId: string }) {
  const [rows, setRows] = useState<Row[]>([]);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("feeds")
      .select("ml_left, ml_right")
      .eq("family_id", familyId)
      .eq("method", "pump")
      .not("ml_left", "is", null)
      .not("ml_right", "is", null);
    setRows((data as Row[]) ?? []);
  }, [supabase, familyId]);

  useEffect(() => {
    load();
  }, [load]);
  useRealtime(supabase, "feeds", familyId, load);

  const stat = useMemo(() => {
    const paired = rows.filter((r) => r.ml_left != null && r.ml_right != null);
    if (paired.length < 3) return null;
    const n = paired.length;
    const lt = paired.reduce((a, r) => a + (r.ml_left as number), 0);
    const rt = paired.reduce((a, r) => a + (r.ml_right as number), 0);
    const la = lt / n;
    const ra = rt / n;
    const hi = Math.max(la, ra);
    const lo = Math.min(la, ra);
    const pct = lo > 0 ? Math.round(((hi - lo) / lo) * 100) : 0;
    const tie = hi === 0 || (hi - lo) / hi < 0.05; // within 5% is a dead heat
    const winner = tie ? "tie" : la > ra ? "left" : "right";
    return { n, lt, rt, la: Math.round(la), ra: Math.round(ra), winner, pct };
  }, [rows]);

  if (!stat) {
    return (
      <div className="card">
        <h2>Top breast 🏆</h2>
        <p className="muted">
          Log a few pump sessions with a left/right split and the leaderboard appears here — trophy and all.
        </p>
      </div>
    );
  }

  const { la, ra, lt, rt, n, winner, pct } = stat;
  const verdict =
    winner === "tie"
      ? "A perfectly matched pair — dead heat 🤝"
      : `${winner === "left" ? "Lefty" : "Righty"}’s out in front by ${pct}% 🏆`;

  const tile = (side: "left" | "right", label: string, avg: number, total: number) => (
    <div className={`breast-tile ${winner === side ? "win" : ""}`}>
      {winner === side && <span className="breast-sticker">🏆 Top</span>}
      <span className="breast-side">{label}</span>
      <span className="breast-avg">{avg} ml</span>
      <span className="breast-tot">{total} ml total</span>
    </div>
  );

  return (
    <div className="card">
      <h2>Top breast 🏆</h2>
      <p className="muted" style={{ marginBottom: 10 }}>
        Average per session across {n} split{n > 1 ? "s" : ""}. All in good fun — you&apos;re both winning. 💛
      </p>
      <div className="breast-lb">
        {tile("left", "Left", la, lt)}
        {tile("right", "Right", ra, rt)}
      </div>
      <p className="breast-verdict">{verdict}</p>
    </div>
  );
}

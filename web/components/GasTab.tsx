"use client";
// GasTab — the "Cotside" blood-gas guide, parents-only. Snap the ABL90
// printout (read server-side, image discarded) or type the numbers; get the
// plain-language read a friendly registrar would give at the cotside; see the
// trend across samples. Educational, not decisions — the banner says so on
// every screen. Capillary O2/sats are never shown. Both parents stay in sync
// via realtime on gas_entries.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFamily } from "@/components/FamilyProvider";
import { useRealtime } from "@/lib/useRealtime";
import { fmtStamp } from "@/lib/dates";
import {
  interpret,
  baseline,
  baselineLines,
  BOUNDS,
  MODES,
  type Band,
  type GasEntry,
  type SupportMode,
  type Interpretation,
} from "@/lib/gas";

type Row = {
  id: string;
  taken_at: string;
  ph: number;
  co2_kpa: number;
  hco3_std: number | null;
  glucose: number | null;
  lactate: number | null;
  fio2_pct: number | null;
  support_mode: SupportMode | null;
  sample_no: string | null;
  note: string | null;
  source: string;
  created_by: string | null;
};

const toEntry = (r: Row): GasEntry => ({
  ph: Number(r.ph),
  co2: Number(r.co2_kpa),
  hco3: r.hco3_std == null ? null : Number(r.hco3_std),
  glu: r.glucose == null ? null : Number(r.glucose),
  lac: r.lactate == null ? null : Number(r.lactate),
  fio2: r.fio2_pct == null ? null : Number(r.fio2_pct),
  mode: r.support_mode,
});

const FIELDS: { id: keyof Form; label: string; unit?: string; range: string; req?: boolean; bounds: readonly [number, number] }[] = [
  { id: "ph", label: "pH", range: "[ 7.350 – 7.450 ]", req: true, bounds: BOUNDS.ph },
  { id: "co2", label: "pCO₂", unit: "kPa", range: "[ 4.80 – 6.00 ]", req: true, bounds: BOUNDS.co2 },
  { id: "hco3", label: "cHCO₃⁻(P,st)", unit: "mmol/L", range: "[ 22.0 – 26.0 ]", bounds: BOUNDS.hco3 },
  { id: "glu", label: "cGlu", unit: "mmol/L", range: "[ 3.5 – 9.0 ]", bounds: BOUNDS.glu },
  { id: "lac", label: "cLac", unit: "mmol/L", range: "[ 0.6 – 2.5 ]", bounds: BOUNDS.lac },
  { id: "fio2", label: "O₂ (FiO₂)", unit: "%", range: "[ 21 = air ]", bounds: BOUNDS.fio2 },
];

type Form = { ph: string; co2: string; hco3: string; glu: string; lac: string; fio2: string; mode: SupportMode | ""; note: string; takenAt: string };
const localNow = () => {
  const d = new Date();
  d.setSeconds(0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const emptyForm = (): Form => ({ ph: "", co2: "", hco3: "", glu: "", lac: "", fio2: "", mode: "", note: "", takenAt: localNow() });

// Offline queue: hospital basements have patchy signal. Entries that can't be
// saved are kept on this phone (localStorage) and flushed when we're back
// online. Numeric values only — same as the server row, no identifiers.
type Pending = Record<string, unknown> & { taken_at: string; _localId: string };
const QUEUE_KEY = "gas-queue-v1";
const CACHE_KEY = "gas-cache-v1";
const readQueue = (): Pending[] => {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); } catch { return []; }
};
const writeQueue = (q: Pending[]) => {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch { /* private mode */ }
};
const num = (v: string) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

const BAND_LABEL: Record<Band, string> = { ok: "OK", soft: "Mildly off", watch: "Watch", act: "Team acting" };

function Sparkline({ points, min, max, fmt, refLo, refHi, colour }: {
  points: (number | null)[]; min: number; max: number; fmt: (v: number) => string; refLo: number; refHi: number; colour: string;
}) {
  const vals = points.filter((v): v is number => v !== null);
  if (vals.length < 2) return null;
  const W = 280, H = 64, P = 6;
  const lo = Math.min(min, ...vals), hi = Math.max(max, ...vals);
  const x = (i: number) => P + (i * (W - 2 * P)) / (points.length - 1);
  const y = (v: number) => H - P - ((v - lo) * (H - 2 * P)) / (hi - lo || 1);
  let d = "";
  points.forEach((v, i) => { if (v !== null) d += `${d ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`; });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} aria-hidden="true">
      <rect x={P} y={y(refHi)} width={W - 2 * P} height={Math.max(2, y(refLo) - y(refHi))} fill="var(--sage)" opacity="0.18" />
      <path d={d} fill="none" stroke={colour} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((v, i) => v !== null && <circle key={i} cx={x(i)} cy={y(v)} r="3.5" fill={colour} />)}
      <text x={W - P} y={y(vals[vals.length - 1]) - 8} textAnchor="end" fontSize="11" fill="var(--ink-soft)" fontFamily="ui-monospace, monospace">
        {fmt(vals[vals.length - 1])}
      </text>
    </svg>
  );
}

export default function GasTab() {
  const { supabase, profile, family, isParent } = useFamily();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [result, setResult] = useState<(Interpretation & { row: Row }) | null>(null);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState("");
  const [showLearn, setShowLearn] = useState(false);
  const [busy, setBusy] = useState(false);

  const [pending, setPending] = useState<Pending[]>([]);
  const [online, setOnline] = useState(true);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("gas_entries")
      .select("*")
      .eq("family_id", family.id)
      .order("taken_at");
    if (err || !data) {
      // offline (or a hiccup): fall back to the last copy this phone saw
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) setRows(JSON.parse(cached));
        else setRows((r) => r ?? []);
      } catch { setRows((r) => r ?? []); }
      return;
    }
    setRows(data as Row[]);
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* private mode */ }
  }, [supabase, family.id]);

  // push queued entries up when we can
  const flush = useCallback(async () => {
    const q = readQueue();
    if (!q.length || !navigator.onLine) return;
    const remaining: Pending[] = [];
    for (const p of q) {
      const { _localId, ...row } = p;
      const { error: err } = await supabase.from("gas_entries").insert(row);
      if (err) remaining.push(p);
    }
    writeQueue(remaining);
    setPending(remaining);
    if (remaining.length < q.length) load();
  }, [supabase, load]);

  useEffect(() => { load(); setPending(readQueue()); }, [load]);
  useRealtime(supabase, "gas_entries", family.id, load);
  useEffect(() => {
    setOnline(navigator.onLine);
    const up = () => { setOnline(true); flush(); };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    flush();
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, [flush]);

  const setF = (k: keyof Form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // her own baseline: prior samples only (never the one being read), so a
  // "high for the textbook, normal for Maisie" CO₂ reads as steady-for-her
  const first = family.baby_name.split(" ")[0];
  function withBaseline(reading: Interpretation, current: Row): Interpretation {
    const prior = (rows ?? []).filter((x) => x.id !== current.id && x.taken_at < current.taken_at).map(toEntry);
    const b = baseline(prior);
    const extra = baselineLines(toEntry(current), b, first);
    return extra.length ? { ...reading, lines: [...reading.lines, ...extra] } : reading;
  }

  // HEIC (and anything else the API can't take) is re-encoded to JPEG on the
  // phone — iPhone Safari decodes HEIC natively, so a canvas round-trip does
  // the conversion with no server dependency. Bonus: it also strips EXIF.
  async function toJpeg(file: File): Promise<File> {
    // Always re-encode: phone photos are 4000px+ and 2–12 MB, and nearly all
    // of the "scanning" wait is uploading that over hospital Wi-Fi and the
    // model chewing through it. The printout is text — 1600px on the long
    // edge reads perfectly and is ~10× smaller. Small files skip straight through.
    if (file.size < 350 * 1024 && ["image/jpeg", "image/png", "image/webp"].includes(file.type)) return file;
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if ("close" in bitmap) bitmap.close();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.82));
    if (!blob) return file;
    return new File([blob], "printout.jpg", { type: "image/jpeg" });
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.files?.[0];
    e.target.value = "";
    if (!raw) return;
    setScanning(true); setScanMsg(""); setError("");
    try {
      let file: File;
      try {
        file = await toJpeg(raw);
      } catch {
        throw new Error("Couldn't open that photo on this phone — try taking it with the camera button.");
      }
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch("/api/extract", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Couldn't read that photo.");
      setForm((f) => ({
        ...f,
        ph: j.ph ?? f.ph,
        co2: j.co2_kpa ?? f.co2,
        hco3: j.hco3_std ?? f.hco3,
        glu: j.glucose ?? f.glu,
        lac: j.lactate ?? f.lac,
        fio2: j.fio2 ?? f.fio2,
        note: [j.sample_no && `sample ${j.sample_no}`, j.time].filter(Boolean).join(" · ") || f.note,
      }));
      setScanMsg("Read from photo — please double-check each number against the printout, then add her support mode and O₂ from the monitor.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that photo. Try a straighter, brighter shot of the printout — or type the values in.");
    }
    setScanning(false);
  }

  async function interpretAndSave() {
    setError("");
    const ph = num(form.ph), co2 = num(form.co2);
    if (ph === null || co2 === null) {
      setError("pH and pCO₂ are the minimum — near the top of the printout under “Blood gas values”.");
      return;
    }
    for (const f of FIELDS) {
      const v = num(form[f.id] as string);
      if (v !== null && (v < f.bounds[0] || v > f.bounds[1])) {
        setError(`${f.label} of ${v} looks like a typo — double-check the printout.`);
        return;
      }
    }
    setBusy(true);
    const insert = {
      family_id: family.id,
      created_by: profile.id,
      taken_at: new Date(form.takenAt).toISOString(),
      ph, co2_kpa: co2,
      hco3_std: num(form.hco3), glucose: num(form.glu), lactate: num(form.lac),
      fio2_pct: num(form.fio2),
      support_mode: form.mode || null,
      note: form.note.trim() || null,
      source: scanMsg ? "photo" : "manual",
    };
    // interpret first — the read never depends on the network
    const local: Row = {
      id: `local-${Date.now()}`, taken_at: insert.taken_at, ph, co2_kpa: co2,
      hco3_std: insert.hco3_std, glucose: insert.glucose, lactate: insert.lactate, fio2_pct: insert.fio2_pct,
      support_mode: insert.support_mode as SupportMode | null, sample_no: null, note: insert.note, source: insert.source, created_by: profile.id,
    };
    const prevRow = [...(rows ?? [])].filter((r) => r.taken_at < local.taken_at).sort((a, b) => a.taken_at.localeCompare(b.taken_at)).at(-1) ?? null;
    const reading = withBaseline(interpret(toEntry(local), prevRow ? toEntry(prevRow) : null), local);

    const queueIt = () => {
      const q = readQueue();
      q.push({ ...insert, _localId: local.id });
      writeQueue(q);
      setPending(q);
      setResult({ ...reading, row: local });
      setForm(emptyForm());
      setScanMsg("");
      setError("");
      setBusy(false);
    };

    if (!navigator.onLine) return queueIt();

    const { data, error: err } = await supabase.from("gas_entries").insert(insert).select("*").single();
    setBusy(false);
    if (err || !data) {
      const msg = err?.message ?? "";
      if (/gas_entries/.test(msg)) return setError("The gas guide isn't switched on in the database yet — run migration 028.");
      // a network-shaped failure (fetch failed / timeout) → keep it on the phone, sync later
      if (/fetch|network|timeout|failed to/i.test(msg) || !msg) return queueIt();
      return setError(msg);
    }
    const saved = data as Row;
    setResult({ ...reading, row: saved });
    setForm(emptyForm());
    setScanMsg("");
    load();
  }

  function reopen(r: Row) {
    const idx = (rows ?? []).findIndex((x) => x.id === r.id);
    const prevRow = idx > 0 ? rows![idx - 1] : null;
    setResult({ ...withBaseline(interpret(toEntry(r), prevRow ? toEntry(prevRow) : null), r), row: r });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function remove(r: Row) {
    if (!window.confirm("Delete this sample?")) return;
    await supabase.from("gas_entries").delete().eq("id", r.id);
    if (result?.row.id === r.id) setResult(null);
    load();
  }

  async function clearAll() {
    if (!window.confirm("Delete ALL saved samples? This can't be undone.")) return;
    await supabase.from("gas_entries").delete().eq("family_id", family.id);
    setResult(null);
    load();
  }

  function exportCsv() {
    const head = ["taken_at", "ph", "co2_kpa", "hco3_std", "glucose", "lactate", "fio2_pct", "support_mode", "note", "source"];
    const body = (rows ?? []).map((r) => head.map((k) => {
      const v = (r as unknown as Record<string, unknown>)[k];
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(","));
    const blob = new Blob([[head.join(","), ...body].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `gas-samples-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const trend = useMemo(() => rows ?? [], [rows]);

  if (!isParent) {
    return (
      <section>
        <div className="card"><div className="empty">This one&apos;s just for mum &amp; dad.</div></div>
      </section>
    );
  }

  return (
    <section>
      <div className="card">
        <p className="gas-kicker">Capillary gas · parent guide</p>
        <h2>How is {family.baby_name.split(" ")[0]} doing?</h2>
        <p className="muted">
          Snap the Radiometer printout or type the numbers in. You&apos;ll get the plain-language read a friendly registrar would give you at the cotside.
        </p>
        <div className="gas-banner">
          <b>This is for understanding, not decisions.</b> One gas is a snapshot; the team weighs the trend, breathing effort and how your baby looks. When in doubt — ask the nurses. They&apos;d always rather explain than have you worry.
        </div>
      </div>

      {(!online || pending.length > 0) && (
        <p className="note" style={{ borderColor: "var(--sky)" }} role="status">
          {!online ? "📵 No signal right now — " : "☁️ "}
          {pending.length > 0
            ? `${pending.length} sample${pending.length > 1 ? "s" : ""} saved on this phone, will sync when you're back online.`
            : "you can still log a sample and read it; it'll sync when you're back online."}
        </p>
      )}

      {/* photo scan */}
      <label className={`card gas-drop ${scanning ? "busy" : ""}`}>
        <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={onPhoto} disabled={scanning} />
        <span style={{ fontWeight: 700 }}>{scanning ? "Reading the printout…" : "📷 Snap or upload the printout"}</span>
        <span className="muted" style={{ display: "block", marginTop: 4 }}>
          {scanning ? "Usually takes a few seconds" : "Values are read off the photo and pre-filled below. The photo is read once and never stored — it has her name on it."}
        </span>
      </label>
      {scanMsg && <p className="note" style={{ borderColor: "var(--sage)" }}>{scanMsg}</p>}

      {/* entry card — styled like the printout */}
      <div className="card">
        <div className="gas-sample-head">SAMPLE</div>
        <div className="gas-fields">
          {FIELDS.map((f) => (
            <label key={f.id} className="gas-field">
              <span className="gas-label">{f.label}{f.req && <span style={{ color: "var(--rose-deep)" }}> *</span>}</span>
              <input
                type="text" inputMode="decimal" value={form[f.id] as string}
                onChange={(e) => setF(f.id, e.target.value)} placeholder="—" aria-label={f.label}
              />
              <span className="gas-unit">{f.unit || ""}</span>
              <span className="gas-range">{f.range}</span>
            </label>
          ))}
          <label className="gas-field">
            <span className="gas-label">Support</span>
            <select value={form.mode} onChange={(e) => setF("mode", e.target.value)} style={{ gridColumn: "2 / -1" }}>
              <option value="">— from the monitor —</option>
              {MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
          <label className="gas-field">
            <span className="gas-label">Taken</span>
            <input type="datetime-local" value={form.takenAt} onChange={(e) => setF("takenAt", e.target.value)} style={{ gridColumn: "2 / -1" }} aria-label="When the sample was taken" />
          </label>
          <label className="gas-field">
            <span className="gas-label">Note</span>
            <input type="text" value={form.note} onChange={(e) => setF("note", e.target.value)} placeholder="e.g. post-vent" style={{ gridColumn: "2 / -1" }} aria-label="Note" />
          </label>
        </div>
        {error && <p className="err">{error}</p>}
        <button className="primary" style={{ width: "100%", marginTop: 12 }} onClick={interpretAndSave} disabled={busy}>
          {busy ? "Saving…" : "Interpret this sample"}
        </button>
      </div>

      {/* result */}
      {result && (
        <div className={`card gas-result band-${result.worst}`}>
          <div className="gas-headline">
            <span className={`gas-dot band-${result.worst}`} aria-hidden="true" />
            <h2 style={{ margin: 0 }}>{result.headline}</h2>
            <span className="badge">{BAND_LABEL[result.worst]}</span>
          </div>
          <p className="muted" style={{ marginTop: 2 }}>{fmtStamp(result.row.taken_at)}{result.row.note ? ` · ${result.row.note}` : ""}</p>
          {result.lines.map((l, i) => <p key={i} style={{ marginTop: 8 }}>{l}</p>)}
          <div style={{ marginTop: 10 }}>
            {(Object.entries(result.per) as [string, [Band, string] | null][]).map(([k, v]) => {
              if (!v) return null;
              const labels: Record<string, string> = { ph: "pH", co2: "pCO₂", fio2: "Oxygen need", hco3: "Bicarbonate", glu: "Glucose", lac: "Lactate" };
              return (
                <div key={k} className="gas-per">
                  <span className={`gas-dot small band-${v[0]}`} aria-hidden="true" />
                  <span><b>{labels[k]}</b> <span className="muted">({BAND_LABEL[v[0]]})</span>: {v[1]}</span>
                </div>
              );
            })}
          </div>
          <div className="gas-banner" style={{ marginTop: 12 }}>
            <b>This is for understanding, not decisions.</b> One gas is a snapshot; the team weighs the trend, breathing effort and how your baby looks. When in doubt — ask the nurses.
          </div>
        </div>
      )}

      {/* trends */}
      {trend.length >= 2 && (
        <div className="card">
          <h2>Her trend <span className="muted">· {trend.length} samples</span></h2>
          <p className="gas-kicker">pH — green band = normal</p>
          <Sparkline points={trend.map((r) => Number(r.ph))} min={7.2} max={7.45} refLo={7.35} refHi={7.45} fmt={(v) => v.toFixed(3)} colour="var(--sage)" />
          <p className="gas-kicker">pCO₂ (kPa) — green band = normal</p>
          <Sparkline points={trend.map((r) => Number(r.co2_kpa))} min={4} max={11} refLo={4.8} refHi={6.0} fmt={(v) => v.toFixed(1)} colour="var(--rose-deep)" />
          {trend.some((r) => r.fio2_pct != null) && (
            <>
              <p className="gas-kicker">Oxygen % — 21 = air</p>
              <Sparkline points={trend.map((r) => (r.fio2_pct == null ? null : Number(r.fio2_pct)))} min={21} max={60} refLo={21} refHi={30} fmt={(v) => `${v}%`} colour="var(--sky)" />
            </>
          )}
        </div>
      )}

      {/* queued (not yet synced) */}
      {pending.length > 0 && (
        <div className="card">
          <h2>Waiting to sync <span className="muted">· {pending.length}</span></h2>
          <ul className="gas-list">
            {pending.map((p) => (
              <li key={p._localId}>
                <span className="gas-row" style={{ cursor: "default" }}>
                  <span className="gas-dot small band-soft" aria-hidden="true" />
                  <span className="gas-when">{fmtStamp(p.taken_at)}</span>
                  <span className="gas-vals">pH {Number(p.ph).toFixed(3)} · CO₂ {Number(p.co2_kpa).toFixed(1)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* history */}
      {rows && rows.length > 0 && (
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0 }}>Saved samples</h2>
            <span>
              <button className="tiny" onClick={exportCsv}>export CSV</button>{" "}
              <button className="tiny" onClick={clearAll}>clear all</button>
            </span>
          </div>
          <ul className="gas-list">
            {[...rows].reverse().map((r) => {
              const it = interpret(toEntry(r), null);
              return (
                <li key={r.id}>
                  <button className="gas-row" onClick={() => reopen(r)}>
                    <span className={`gas-dot small band-${it.worst}`} aria-hidden="true" />
                    <span className="gas-when">{fmtStamp(r.taken_at)}</span>
                    <span className="gas-vals">
                      pH {Number(r.ph).toFixed(3)} · CO₂ {Number(r.co2_kpa).toFixed(1)}
                      {r.fio2_pct != null ? ` · ${r.fio2_pct}%` : ""}
                      {r.support_mode ? ` · ${MODES.find((m) => m.id === r.support_mode)?.label.split(" ")[0]}` : ""}
                    </span>
                    {r.note && <span className="muted gas-note">{r.note}</span>}
                  </button>
                  <button className="tiny" onClick={() => remove(r)} aria-label="Delete sample">✕</button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* learn */}
      <div className="card">
        <button className="ghost" style={{ width: "100%" }} onClick={() => setShowLearn((s) => !s)}>
          {showLearn ? "Hide" : "📖 What do these numbers mean?"}
        </button>
        {showLearn && (
          <div className="gas-learn">
            <h3>Respiratory vs metabolic acidosis</h3>
            <p>“Acidosis” just means the blood is a little more acidic than ideal (pH below 7.35). If it&apos;s because CO₂ is high, that&apos;s <b>respiratory</b> — the lungs aren&apos;t clearing CO₂ fast enough, the classic preterm picture. If CO₂ is fine but bicarbonate is low, that&apos;s <b>metabolic</b> — acid building up from elsewhere, and the team looks at lactate, feeding and circulation.</p>
            <h3>Compensation</h3>
            <p>Her kidneys quietly hold onto bicarbonate to buffer extra CO₂. When you see a high CO₂ but a near-normal pH and a high bicarbonate, that&apos;s compensation doing its job — a sign the picture has been building for a while, not a new problem.</p>
            <h3>Permissive hypercapnia</h3>
            <p>Neonatal teams often deliberately accept a CO₂ up to about 8 kPa as long as the pH holds up, because pushing harder with the ventilator can hurt fragile lungs. A “raised” CO₂ is frequently the plan, not a slip.</p>
            <h3>Why we ignore the oxygen numbers on the printout</h3>
            <p>Heel-prick blood is a mix of capillary and tissue blood, so its oxygen readings (pO₂ / sO₂) are unreliable — they&apos;re not what the team uses. Her real oxygen picture comes from the monitor and how much extra oxygen she needs, which is why this guide asks for FiO₂ instead.</p>
            <h3>The support ladder</h3>
            <p>Air → low-flow oxygen → high-flow → CPAP → BiPAP/NIV → ventilator. Each step takes a bit more of the breathing work off her. Moving <i>down</i> is the direction you want; a step up usually means the team acted early to spare her effort.</p>
            <h3>What tips a team toward more support</h3>
            <p>Rarely a single number. It&apos;s the <b>trend</b> — pH drifting down and CO₂ drifting up across samples — combined with how hard she&apos;s working to breathe and how tired she looks. Effort matters as much as the numbers, which is exactly why one gas is only ever a snapshot.</p>
          </div>
        )}
      </div>

      <p className="muted" style={{ fontSize: "0.78rem", padding: "0 6px 12px" }}>
        Reference ranges are the ones printed on the ABL90 report. Photo reading uses AI and can misread digits — always verify against the printout. Educational tool for parents; never a substitute for the neonatal team.
      </p>
    </section>
  );
}

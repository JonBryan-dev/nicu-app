"use client";
// Shell — persistent hero (baby name, Day N, born line) + sticky pill tabs.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useFamily } from "@/components/FamilyProvider";
import { dayNumber, fmtDate } from "@/lib/dates";
import type { Profile } from "@/lib/types";
import PushPrompt from "@/components/PushPrompt";
import InstallPrompt from "@/components/InstallPrompt";
import ThemePicker from "@/components/ThemePicker";
import ParentPresence from "@/components/ParentPresence";

function InviteShare({ code, baby }: { code?: string; baby: string }) {
  const [copied, setCopied] = useState(false);
  if (!code) return null;
  const link =
    typeof window !== "undefined"
      ? `${window.location.origin}/join?code=${code}`
      : "";
  const msg = `You're invited to ${baby}'s private space 💛 Tap to join: ${link}`;
  return (
    <div className="row" style={{ margin: "6px 0 12px" }}>
      <button
        type="button"
        className="ghost"
        onClick={() => {
          navigator.clipboard?.writeText(link);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copied ✓" : "Copy link"}
      </button>
      <button
        type="button"
        className="ghost"
        onClick={() =>
          window.open("https://wa.me/?text=" + encodeURIComponent(msg), "_blank")
        }
      >
        WhatsApp
      </button>
    </div>
  );
}

const TABS = [
  { href: "/", label: "Updates", icon: "✦" },
  { href: "/feeds", label: "Feeds", icon: "🍼", parentOnly: true },
  { href: "/lists", label: "Lists", icon: "☑️", parentOnly: true },
  { href: "/support", label: "Support", icon: "💛" },
  { href: "/visits", label: "Visits", icon: "📅" },
  { href: "/rest", label: "Rest", icon: "😴", parentOnly: true },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const { supabase, profile, family, isParent } = useFamily();
  const pathname = usePathname();
  const router = useRouter();
  const [showCodes, setShowCodes] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showTheme, setShowTheme] = useState(false);
  const [members, setMembers] = useState<(Profile & { created_at?: string })[]>([]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");

  async function saveRename(id: string) {
    const name = renameVal.trim();
    if (!name) return;
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: name })
      .eq("id", id);
    if (error) {
      alert(error.message);
      return;
    }
    setMembers((ms) => ms.map((m) => (m.id === id ? { ...m, display_name: name } : m)));
    setRenamingId(null);
    if (id === profile.id) router.refresh();
  }

  const navRef = useRef<HTMLElement>(null);

  // The bottom bar is fixed to the *layout* viewport, but iOS moves the
  // *visible* viewport as the address bar shows/hides on scroll — so a plain
  // fixed bar drifts. Re-pin it to the visible bottom on every viewport change,
  // which also holds it steady during scroll. Separately, hide it only while a
  // text field is genuinely focused (a real keyboard), never on scroll alone.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const isField = (el: Element | null) =>
      !!el && /^(INPUT|TEXTAREA)$/.test(el.tagName);
    const sync = () => {
      // keyboard up → hide; otherwise pin to the visible viewport bottom
      const kbUp = isField(document.activeElement) && window.innerHeight - vv.height > 120;
      document.body.classList.toggle("kb-open", kbUp);
      const nav = navRef.current;
      if (nav) {
        // only the mobile bar is fixed; leave the desktop sticky nav alone
        const mobile = window.matchMedia("(max-width: 640px)").matches;
        const offset = window.innerHeight - vv.height - vv.offsetTop;
        // 0 in a standalone PWA (no address bar); corrects the drift in Safari
        nav.style.transform = mobile ? `translate3d(0, ${(-offset).toFixed(1)}px, 0)` : "";
      }
    };
    const onBlur = () => setTimeout(sync, 60);
    window.addEventListener("focusin", sync);
    window.addEventListener("focusout", onBlur);
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    sync();
    return () => {
      window.removeEventListener("focusin", sync);
      window.removeEventListener("focusout", onBlur);
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
      if (navRef.current) navRef.current.style.transform = "";
      document.body.classList.remove("kb-open");
    };
  }, []);

  useEffect(() => {
    if (!showCodes || !isParent) return;
    supabase
      .from("profiles")
      .select("id, display_name, role, created_at")
      .eq("family_id", family.id)
      .order("created_at")
      .then(({ data }) => setMembers((data as (Profile & { created_at?: string })[]) ?? []));
  }, [showCodes, isParent, supabase, family.id]);
  const [pw, setPw] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

  async function setPassword(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) {
      setPwMsg("Use at least 8 characters.");
      return;
    }
    setPwBusy(true);
    setPwMsg("");
    const { error } = await supabase.auth.updateUser({ password: pw });
    setPwBusy(false);
    if (error) {
      setPwMsg(error.message);
      return;
    }
    setPw("");
    setPwMsg("Done — next time you can sign in with your email and password.");
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="wrap">
      <div className="hero">
        <div className="baby">{family.baby_name}</div>
        <div className="day">Day {dayNumber(family.baby_dob)}</div>
        <div className="sub">
          of her journey · born {fmtDate(family.baby_dob)}
        </div>
        <div className="hello">
          Hi {profile.display_name} ·{" "}
          {isParent && (
            <>
              <button onClick={() => setShowCodes((s) => !s)}>
                invite codes
              </button>{" "}
              ·{" "}
            </>
          )}
          <button onClick={() => setShowTheme((s) => !s)}>appearance</button> ·{" "}
          <button onClick={() => setShowPw((s) => !s)}>password</button> ·{" "}
          <button onClick={signOut}>sign out</button>
        </div>
      </div>

      <ParentPresence />

      {showTheme && <ThemePicker />}

      {showPw && (
        <div className="card">
          <h2>Set a password</h2>
          <p className="note">
            Once set, you can sign in with just your email and password — no
            more email links.
          </p>
          <form onSubmit={setPassword}>
            <div className="row">
              <input
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder="New password (8+ characters)"
                autoComplete="new-password"
                aria-label="New password"
              />
              <button
                className="primary"
                style={{ flex: "0 0 auto" }}
                type="submit"
                disabled={pwBusy}
              >
                {pwBusy ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
          {pwMsg && (
            <p className="muted" style={{ marginTop: 8 }}>
              {pwMsg}
            </p>
          )}
        </div>
      )}

      {showCodes && isParent && (
        <div className="card">
          <h2>Invite people</h2>
          <p className="note">
            Share a link — they tap it, add their name, email and a password,
            and they&apos;re in. The link decides what they can do.
          </p>
          <label>Family &amp; friends</label>
          <div className="code-box">{family.family_code}</div>
          <InviteShare code={family.family_code} baby={family.baby_name} />
          <label>Other parent — full access</label>
          <div className="code-box">{family.parent_code}</div>
          <InviteShare code={family.parent_code} baby={family.baby_name} />
          {family.team_code && (
            <>
              <label>NICU team — updates &amp; photos only</label>
              <div className="code-box">{family.team_code}</div>
              <InviteShare code={family.team_code} baby={family.baby_name} />
            </>
          )}

          <label>Who&apos;s here ({members.length})</label>
          {members.map((m) => (
            <div key={m.id} className="memberrow">
              {renamingId === m.id ? (
                <form
                  className="row"
                  style={{ flex: 1 }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveRename(m.id);
                  }}
                >
                  <input
                    type="text"
                    value={renameVal}
                    onChange={(e) => setRenameVal(e.target.value)}
                    aria-label="New name"
                    autoFocus
                  />
                  <button className="ghost" style={{ flex: "0 0 auto" }} type="submit">
                    Save
                  </button>
                  <button
                    type="button"
                    className="tiny"
                    onClick={() => setRenamingId(null)}
                  >
                    ✕
                  </button>
                </form>
              ) : (
                <>
                  <span>
                    {m.display_name}
                    {m.id === profile.id && <span className="muted"> (you)</span>}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {isParent && (
                      <button
                        className="tiny"
                        onClick={() => {
                          setRenamingId(m.id);
                          setRenameVal(m.display_name);
                        }}
                        aria-label={`Rename ${m.display_name}`}
                      >
                        rename
                      </button>
                    )}
                    <span
                      className="badge"
                      style={
                        m.role === "parent"
                          ? { background: "var(--rose-deep)", color: "var(--on-accent)" }
                          : m.role === "team"
                            ? { background: "var(--sky)", color: "var(--on-accent)" }
                            : undefined
                      }
                    >
                      {m.role === "parent" ? "Parent" : m.role === "team" ? "NICU team" : "Family"}
                    </span>
                  </span>
                </>
              )}
            </div>
          ))}
          <p className="muted" style={{ marginTop: 8 }}>
            Need to remove someone? That&apos;s done from the Supabase dashboard
            for now — ask Claude.
          </p>
        </div>
      )}

      <InstallPrompt />

      <PushPrompt />

      <nav className="tabs" aria-label="Sections" ref={navRef}>
        {TABS.filter((t) =>
          profile.role === "team" ? t.href === "/" : isParent || !t.parentOnly
        ).map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={pathname === t.href ? "on" : ""}
          >
            <span className="ico" aria-hidden="true">{t.icon}</span>
            <span>{t.label}</span>
          </Link>
        ))}
      </nav>

      {children}
    </div>
  );
}

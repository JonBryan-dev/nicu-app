"use client";
// Shell — persistent hero (baby name, Day N, born line) + sticky pill tabs.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useFamily } from "@/components/FamilyProvider";
import { dayNumber, fmtDate } from "@/lib/dates";
import PushPrompt from "@/components/PushPrompt";

const TABS = [
  { href: "/", label: "Updates" },
  { href: "/feeds", label: "Feeds", parentOnly: true },
  { href: "/lists", label: "Lists", parentOnly: true },
  { href: "/support", label: "Support" },
  { href: "/visits", label: "Visits" },
  { href: "/rest", label: "Rest" },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const { supabase, profile, family, isParent } = useFamily();
  const pathname = usePathname();
  const router = useRouter();
  const [showCodes, setShowCodes] = useState(false);
  const [showPw, setShowPw] = useState(false);
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
          <button onClick={() => setShowPw((s) => !s)}>password</button> ·{" "}
          <button onClick={signOut}>sign out</button>
        </div>
      </div>

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
          <h2>Invite codes</h2>
          <p className="note">
            Parent code gives full access — family code is for everyone else.
          </p>
          <label>Parent code</label>
          <div className="code-box">{family.parent_code}</div>
          <label>Family &amp; friends code</label>
          <div className="code-box">{family.family_code}</div>
          {family.team_code && (
            <>
              <label>NICU team code — updates &amp; photos only</label>
              <div className="code-box">{family.team_code}</div>
            </>
          )}
        </div>
      )}

      <PushPrompt />

      <nav className="tabs" aria-label="Sections">
        {TABS.filter((t) =>
          profile.role === "team" ? t.href === "/" : isParent || !t.parentOnly
        ).map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={pathname === t.href ? "on" : ""}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {children}
    </div>
  );
}

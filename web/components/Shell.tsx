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
  { href: "/lists", label: "Lists" },
  { href: "/support", label: "Support" },
  { href: "/visits", label: "Visits" },
  { href: "/rest", label: "Rest" },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const { supabase, profile, family, isParent } = useFamily();
  const pathname = usePathname();
  const router = useRouter();
  const [showCodes, setShowCodes] = useState(false);

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
          <button onClick={signOut}>sign out</button>
        </div>
      </div>

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
        </div>
      )}

      <PushPrompt />

      <nav className="tabs" aria-label="Sections">
        {TABS.map((t) => (
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

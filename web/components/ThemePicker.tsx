"use client";
// ThemePicker — five gentle palettes, saved per device. "Night" is for the
// 3am pump sessions. Applied via data-theme on <html>; a tiny inline script
// in the root layout re-applies it before paint so there's no flash.
import { useEffect, useState } from "react";

const THEMES = [
  { id: "linen", name: "Linen", bg: "#FAF7F2", accent: "#A96065" },
  { id: "garden", name: "Garden", bg: "#F4F7F2", accent: "#5F7D5C" },
  { id: "dusk", name: "Dusk", bg: "#F3F6F9", accent: "#5C7A96" },
  { id: "lavender", name: "Lavender", bg: "#F7F4FA", accent: "#7A669B" },
  { id: "night", name: "Night", bg: "#211E26", accent: "#D9A2A6" },
] as const;

const KEY = "nicu-theme";

export function applyTheme(id: string) {
  if (id === "linen") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", id);
  }
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* private browsing */
  }
  const theme = THEMES.find((t) => t.id === id);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && theme) meta.setAttribute("content", theme.bg);
}

export default function ThemePicker() {
  const [current, setCurrent] = useState("linen");

  useEffect(() => {
    try {
      setCurrent(localStorage.getItem(KEY) ?? "linen");
    } catch {
      /* fine */
    }
  }, []);

  return (
    <div className="card">
      <h2>Appearance</h2>
      <p className="note">
        Pick what feels right — Night is easy on the eyes for 3am pumps. Saved
        on this device.
      </p>
      <div className="themes">
        {THEMES.map((t) => (
          <button
            key={t.id}
            className={`theme ${current === t.id ? "on" : ""}`}
            onClick={() => {
              setCurrent(t.id);
              applyTheme(t.id);
            }}
            aria-label={`${t.name} theme`}
            aria-pressed={current === t.id}
          >
            <span
              className="swatch"
              style={{ background: t.bg, borderColor: t.accent }}
            >
              <i style={{ background: t.accent }} />
            </span>
            <span>{t.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

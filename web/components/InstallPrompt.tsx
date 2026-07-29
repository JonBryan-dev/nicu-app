"use client";
// InstallPrompt — one-time nudge to put the app on the home screen.
// iOS has no install API, so we show the Share → Add to Home Screen steps
// (and notifications only work from the installed app there, which is the
// real motivator). Android/Chrome gets the native install dialog via
// beforeinstallprompt. Never shows when already installed or after dismissal.
// Preview any time with ?show-install=1.
import { useEffect, useState } from "react";

const KEY = "install-prompt-done";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

export default function InstallPrompt() {
  const [show, setShow] = useState<null | "ios" | "android">(null);
  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    try {
      const forced = window.location.search.includes("show-install");
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true;
      if (!forced && (standalone || localStorage.getItem(KEY))) return;
      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      if (isIOS || forced) {
        setShow("ios");
        return;
      }
      const handler = (e: Event) => {
        e.preventDefault();
        setInstallEvt(e as BeforeInstallPromptEvent);
        setShow("android");
      };
      window.addEventListener("beforeinstallprompt", handler);
      return () => window.removeEventListener("beforeinstallprompt", handler);
    } catch {
      /* very old browser — never mind */
    }
  }, []);

  if (!show) return null;

  function dismiss() {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* private browsing */
    }
    setShow(null);
  }

  async function installAndroid() {
    if (installEvt) {
      await installEvt.prompt();
      await installEvt.userChoice;
    }
    dismiss();
  }

  return (
    <div className="card">
      <h2>Put Maisie on your home screen ✦</h2>
      {show === "ios" ? (
        <>
          <p className="note">
            It opens like a real app — and on iPhone it&apos;s the only way
            notifications work, so you&apos;ll never miss an update.
          </p>
          <ol className="installsteps">
            <li>
              Tap the <b>Share</b> button below
              <span aria-hidden="true"> — the square with the arrow ↑</span>
            </li>
            <li>
              Scroll down and tap <b>Add to Home Screen</b> ➕
            </li>
            <li>
              Open the app from the new <b>✦ Maisie</b> icon and sign in once
            </li>
          </ol>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="primary" onClick={dismiss}>
              Done — it&apos;s on my home screen
            </button>
            <button className="ghost" style={{ flex: "0 0 auto" }} onClick={dismiss}>
              Not now
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="note">
            Install it like a real app — one tap, and updates arrive as
            notifications.
          </p>
          <div className="row">
            <button className="primary" onClick={installAndroid}>
              Install the app
            </button>
            <button className="ghost" style={{ flex: "0 0 auto" }} onClick={dismiss}>
              Not now
            </button>
          </div>
          <p className="muted" style={{ marginTop: 8 }}>
            If Android shows a &ldquo;Play Protect / unsafe app&rdquo; warning,
            it&apos;s a false alarm on Google&apos;s installer — tap{" "}
            <b>More details → Install anyway</b>. Or just skip it: updates and
            notifications work fine right here in your browser too.
          </p>
        </>
      )}
    </div>
  );
}

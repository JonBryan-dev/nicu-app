# Putting the app on the App Store (Capacitor wrapper)

This wraps the existing web app in a native shell so it can be submitted to the
Apple App Store and Google Play. **It does not change the web app or your live
PWA** — it's a separate build that loads the same site.

> ⚠️ **Honest heads-up.** This app is server-rendered (Next.js on Vercel), so the
> wrapper loads your hosted URL in a native web view. Apple sometimes rejects
> "just a website in a wrapper" under **Guideline 4.2 (minimum functionality)**.
> To pass reliably, plan to add native touches (native push via APNs, an offline
> screen, a splash screen). Consider doing this **after** validating demand as
> the installable PWA — which needs none of this.

## You will need
- A **Mac** with **Xcode** installed (App Store submission is Mac-only).
- An **Apple Developer account** ($99/year) and, for Android, a Google Play
  account ($25 once).
- App icons (1024×1024) and a **privacy policy URL** — you have `/privacy`.
- To complete Apple's **privacy "nutrition label"** questionnaire (declare:
  account email, photos, user content; not used for tracking).

## One-time setup (run at the repo root, on your Mac)
```bash
cd web
npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/app @capacitor/push-notifications
npx cap init "Maisie" "com.YOURNAME.maisie" --web-dir=public
```

Then create **`web/capacitor.config.ts`** with this (the `server.url` makes the
shell load your live site, so you don't have to statically export the app):
```ts
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.YOURNAME.maisie",
  appName: "Maisie",
  webDir: "public",
  server: {
    url: "https://nicu-app-zeta.vercel.app",
    cleartext: false,
  },
  ios: { contentInset: "always" },
};

export default config;
```

Add the platforms and open Xcode:
```bash
npx cap add ios
npx cap open ios      # opens Xcode
# (npx cap add android  — for Google Play)
```

## In Xcode
1. Select the project → **Signing & Capabilities** → pick your Apple Developer
   **Team**; set the **Bundle Identifier** to `com.YOURNAME.maisie`.
2. Drop in the app icon set.
3. Run on a simulator/device to check it loads.
4. **Product → Archive** → **Distribute App** → App Store Connect → upload.
5. In **App Store Connect**: fill listing, screenshots, the **privacy policy URL**
   (`https://nicu-app-zeta.vercel.app/privacy`), and the privacy nutrition labels,
   then submit for review.

## Recommended before you submit (lowers rejection risk)
- **Native push (APNs)** instead of web push inside the wrapper — Apple likes a
  real native capability. `@capacitor/push-notifications` + an APNs key.
- A **splash screen** and app icon so it feels native on launch.
- An **offline fallback** screen for no-signal.

## What this does NOT touch
- Your Vercel deployment, the PWA, or any family data. Deleting the `ios/` /
  `android/` folders and the Capacitor packages reverts everything.

import type { Metadata, Viewport } from "next";
import { Fraunces, Nunito_Sans } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-fraunces",
});
const nunito = Nunito_Sans({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-nunito",
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: "Our NICU Journey",
  description: "A private space for our family during the NICU stay.",
  manifest: "/manifest.json",
  icons: { apple: "/icon-192.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#FAF7F2",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${fraunces.variable} ${nunito.variable}`}>
      <body>
        {/* apply the saved theme before first paint — no flash */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('nicu-theme');if(t&&t!=='linen'){document.documentElement.setAttribute('data-theme',t);var m=document.querySelector('meta[name=\"theme-color\"]');var c={garden:'#F4F7F2',dusk:'#F3F6F9',lavender:'#F7F4FA',night:'#211E26'}[t];if(m&&c){m.setAttribute('content',c)}}}catch(e){}",
          }}
        />
        {children}
      </body>
    </html>
  );
}

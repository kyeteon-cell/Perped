import type { Metadata, Viewport } from "next";
import { Nunito, Barlow } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Nav } from "@/components/Nav";
import { Ticker } from "@/components/Ticker";
import { APP_NAME, APP_URL } from "@/lib/config";

const sans = Nunito({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-sans", display: "swap" });
const mono = Barlow({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: `${APP_NAME} — get perped`, template: `%s · ${APP_NAME}` },
  description: "Social perps on Hyperliquid. Every trade is a post. Copy the best, fade the rest.",
  metadataBase: new URL(APP_URL),
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: APP_NAME },
  openGraph: { title: `${APP_NAME} — get perped`, description: "Social perps on Hyperliquid.", type: "website" },
};

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#ffffff" }, { media: "(prefers-color-scheme: dark)", color: "#0f1012" }],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

// Runs before paint: resolves Day / Night / Auto from localStorage into data-theme so there is no flash.
const themeScript = `(function(){try{var t=localStorage.getItem("perped-theme")||"auto";var d=t==="dark"||(t==="auto"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.setAttribute("data-theme",d?"dark":"light");}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh">
        <Providers>
          <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col pb-24">
            <Ticker />
            {children}
          </div>
          <Nav />
        </Providers>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Nunito, Barlow } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Nav } from "@/components/Nav";
import { Ticker } from "@/components/Ticker";
import { APP_NAME, APP_URL } from "@/lib/config";

const sans = Nunito({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-sans", display: "swap" });
const mono = Barlow({ subsets: ["latin"], weight: ["500", "600", "700", "800"], style: ["normal", "italic"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: `${APP_NAME} — get perped`, template: `%s · ${APP_NAME}` },
  description: "Social perps on Hyperliquid. Every trade is a post. Copy the best, fade the rest.",
  // Absolute links for share previews: the custom domain once set, else the Vercel production URL.
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : APP_URL)),
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/api/share-bg/icon-32", sizes: "32x32", type: "image/png" }, { url: "/api/share-bg/icon-512", sizes: "512x512", type: "image/png" }],
    apple: [{ url: "/api/share-bg/icon-180", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, statusBarStyle: "default", title: APP_NAME },
  openGraph: { title: `${APP_NAME} — get perped`, description: "Social perps on Hyperliquid.", type: "website" },
};

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f6f7f9" }, { media: "(prefers-color-scheme: dark)", color: "#0b0c0e" }],
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
          <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col pb-32">
            <Ticker />
            {children}
          </div>
          <Nav />
        </Providers>
      </body>
    </html>
  );
}

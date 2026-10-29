import type { Metadata, Viewport } from "next";
import { DM_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Nav } from "@/components/Nav";
import { APP_NAME, APP_URL } from "@/lib/config";

const sans = DM_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: `${APP_NAME} — get perped`, template: `%s · ${APP_NAME}` },
  description: "Social perps on Hyperliquid. Every trade is a post. Copy the best, roast the rest.",
  metadataBase: new URL(APP_URL),
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: APP_NAME },
  openGraph: { title: `${APP_NAME} — get perped`, description: "Social perps on Hyperliquid.", type: "website" },
};

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f6f6f4" }, { media: "(prefers-color-scheme: dark)", color: "#101113" }],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-dvh">
        <Providers>
          <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-24 pt-4 sm:max-w-2xl">
            {children}
          </div>
          <Nav />
        </Providers>
      </body>
    </html>
  );
}

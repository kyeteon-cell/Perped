import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Nav } from "@/components/Nav";
import { APP_NAME, APP_URL } from "@/lib/config";

export const metadata: Metadata = {
  title: { default: `${APP_NAME} — get perped`, template: `%s · ${APP_NAME}` },
  description: "Social perps on Hyperliquid. Every trade is a post. Copy the best, roast the rest.",
  metadataBase: new URL(APP_URL),
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: APP_NAME },
  openGraph: { title: `${APP_NAME} — get perped`, description: "Social perps on Hyperliquid.", type: "website" },
};

export const viewport: Viewport = {
  themeColor: "#0b0d12",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
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

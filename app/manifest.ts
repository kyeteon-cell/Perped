import type { MetadataRoute } from "next";
import { APP_NAME } from "@/lib/config";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_NAME,
    description: "Social perps on Hyperliquid. Every trade is a post.",
    start_url: "/",
    display: "standalone",
    background_color: "#0f1012",
    theme_color: "#0f1012",
    icons: [
      { src: "/api/share-bg/icon-180", sizes: "180x180", type: "image/png" },
      { src: "/api/share-bg/icon-512", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}

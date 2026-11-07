"use client";

import { tt } from "@/lib/i18n";

/** Translated text for server-rendered pages (they can't call tt() in the browser themselves). */
export function T({ s }: { s: string }) {
  return <>{tt(s)}</>;
}

"use client";

import { Fragment, useEffect, useState } from "react";
import { loadLang, storedLang } from "@/lib/i18n";

/**
 * Applies the saved language once on start-up: loads its file, then re-renders the app in it. The head script
 * in the layout hides the page until this is done (with a 2.5s safety net), so English never flashes.
 */
export function LangGate({ children }: { children: React.ReactNode }) {
  const [gen, setGen] = useState(0);
  useEffect(() => {
    const l = storedLang();
    const done = () => document.documentElement.removeAttribute("data-lang-wait");
    if (l === "en") return done();
    loadLang(l).then(() => { document.documentElement.lang = l; setGen(1); }).catch(() => null).finally(() => requestAnimationFrame(done));
  }, []);
  return <Fragment key={gen}>{children}</Fragment>;
}

"use client";

import { useEffect, useState } from "react";
import { LANGS, setLang, storedLang, tt, type Lang } from "@/lib/i18n";

/** Settings → Language. Picking one saves it on this device and reloads the app in that language. */
export function LanguagePicker() {
  const [cur, setCur] = useState<Lang>("en");
  useEffect(() => setCur(storedLang()), []);
  return (
    <div className="px-5 pb-2">
      <div className="lang-list" role="radiogroup" aria-label={tt("Language")}>
        {LANGS.map((l) => (
          <button key={l.code} role="radio" aria-checked={cur === l.code} className={cur === l.code ? "on" : ""} onClick={() => cur !== l.code && setLang(l.code)}>
            <span lang={l.code}>{l.name}</span>
            {cur === l.code && <small>{tt("In use")}</small>}
          </button>
        ))}
      </div>
    </div>
  );
}

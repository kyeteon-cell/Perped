"use client";

import { useEffect, useState } from "react";
import { LANGS, setLang, storedLang, tt, type Lang } from "@/lib/i18n";
import { Sheet } from "@/components/Sheet";
import { Flag } from "@/components/Flag";

/**
 * Settings → Language. One compact row showing the current language; tapping it opens a sheet with every
 * language and its flag. Picking one only selects it; nothing changes until "Change" is pressed, so a stray
 * tap can't switch the app's language. Changing saves it on this device and reloads in that language.
 */
export function LanguagePicker() {
  const [cur, setCur] = useState<Lang>("en");
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<Lang>("en");
  useEffect(() => setCur(storedLang()), []);
  const now = LANGS.find((l) => l.code === cur) ?? LANGS[0];
  const next = LANGS.find((l) => l.code === pick) ?? now;

  return (
    <>
      <button type="button" className="lang-pill" aria-haspopup="dialog" onClick={() => { setPick(cur); setOpen(true); }}>
        <Flag code={now.code} size={21} />
        <span lang={now.code}>{now.name}</span>
        <svg className="chev" width="14" height="14" viewBox="0 0 24 24" aria-hidden><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <Sheet label={tt("Language")} onClose={() => setOpen(false)} className="lang-sheet">
          <div className="lang-head" data-sheet-handle>{tt("Language")}</div>
          <div className="lang-opts" role="radiogroup" aria-label={tt("Language")}>
            {LANGS.map((l) => (
              <button key={l.code} type="button" role="radio" aria-checked={pick === l.code} className={pick === l.code ? "on" : ""} onClick={() => setPick(l.code)}>
                <Flag code={l.code} size={24} />
                <span lang={l.code}>{l.name}</span>
                {cur === l.code && <small>{tt("In use")}</small>}
                <i className="tick" aria-hidden />
              </button>
            ))}
          </div>
          <div className="lang-act">
            <button type="button" className="btn ghost" onClick={() => setOpen(false)}>{tt("Cancel")}</button>
            <button type="button" className="btn ink" disabled={pick === cur} onClick={() => setLang(pick)}>
              {pick === cur ? tt("In use") : <>{tt("Change")} <Flag code={next.code} size={18} /> <span lang={next.code}>{next.name}</span></>}
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}

"use client";


import { tt } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { Sheet } from "./Sheet";
import { APP_VERSION, RELEASES, type Release } from "@/lib/patch-notes";

const SEEN = "perped:notes-seen";

/** Settings row: "What's new · v0.9.4", with a dot until you've read this version's notes. Opens the patch notes. */
export function PatchNotesRow() {
  const [open, setOpen] = useState(false);
  const [unseen, setUnseen] = useState(false);
  useEffect(() => { try { setUnseen(localStorage.getItem(SEEN) !== APP_VERSION); } catch {} }, []);
  const show = () => { setOpen(true); setUnseen(false); try { localStorage.setItem(SEEN, APP_VERSION); } catch {} };
  return (
    <>
      <button type="button" className="srow pn-row" onClick={show}>
        <span>{tt("What's new")}{unseen && <i className="pn-dot" aria-label={tt("New update")} />}</span>
        <span className="mono when">v{APP_VERSION} →</span>
      </button>
      {open && <PatchNotesSheet onClose={() => setOpen(false)} />}
    </>
  );
}

function Section({ label, items, tone }: { label: string; items?: string[]; tone: "new" | "imp" | "fix" }) {
  if (!items?.length) return null;
  return (
    <div className="pn-sec">
      <span className={`pn-tag ${tone}`}>{label}</span>
      <ul>{items.map((t) => <li key={t}>{t}</li>)}</ul>
    </div>
  );
}

function ReleaseCard({ r, latest }: { r: Release; latest: boolean }) {
  const [open, setOpen] = useState(latest);
  return (
    <section className={`pn-rel ${latest ? "latest" : ""}`}>
      <button type="button" className="pn-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span><b className="mono">v{r.version}</b>{latest && <em>{tt("Latest")}</em>}<small>{r.title}</small></span>
        <span className="when">{r.date} {open ? "▴" : "▾"}</span>
      </button>
      {open && <div className="pn-body"><Section label={tt("New")} items={r.new} tone="new" /><Section label={tt("Improved")} items={r.improved} tone="imp" /><Section label={tt("Fixed")} items={r.fixed} tone="fix" /></div>}
    </section>
  );
}

export function PatchNotesSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet label={tt("Patch notes")} onClose={onClose}>
      <div className="pn px-5 pb-6">
        <div className="pn-top" data-sheet-handle><b>{tt("Patch notes")}</b><span className="when">{tt("You're on v")}{APP_VERSION}</span></div>
        {RELEASES.map((r, i) => <ReleaseCard key={`${r.version}-${i}`} r={r} latest={i === 0} />)}
        <button type="button" className="btn ghost mt-3 w-full" style={{ padding: 12, fontSize: 14 }} onClick={onClose}>{tt("Done")}</button>
      </div>
    </Sheet>
  );
}

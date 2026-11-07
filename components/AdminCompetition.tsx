"use client";


import { tt } from "@/lib/i18n";
import { useCallback, useEffect, useState } from "react";

type Settings = { goal: number; startAt: string; details?: string | null; detailsUrl?: string | null; hidden?: boolean };
type Board = { count: number; goal: number; recruiters: { handle: string; n: number }[] };
const LAUNCH = "2026-01-01T00:00:00.000Z";

/** Owner-only controls for the alpha competition bar: goal, counting window, visibility, and what unlocks at the goal. */
export function AdminCompetition({ call }: { call: (url: string, init?: RequestInit) => Promise<Response> }) {
  const [s, setS] = useState<Settings | null>(null);
  const [b, setB] = useState<Board | null>(null);
  const [goal, setGoal] = useState(""), [details, setDetails] = useState(""), [url, setUrl] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await call("/api/admin/competition").then((x) => x.json()).catch(() => null);
    if (!r || r.error) return setMsg(r?.error ?? "Couldn't load");
    setS(r); setGoal(String(r.goal)); setDetails(r.details ?? ""); setUrl(r.detailsUrl ?? "");
    setB(await call("/api/competition").then((x) => x.json()).catch(() => null));
  }, [call]);
  useEffect(() => { load(); }, [load]);

  const save = async (patch: Record<string, unknown>, done: string) => {
    setMsg(tt("Saving…"));
    const r = await call("/api/admin/competition", { method: "POST", body: JSON.stringify(patch) }).then((x) => x.json()).catch(() => ({ error: "network" }));
    if (r.error) return setMsg(r.error);
    setMsg(done); load();
  };
  if (!s) return <section className="inv-card"><p className="when">{msg ?? tt("Loading…")}</p></section>;
  const sinceLaunch = new Date(s.startAt).getTime() <= new Date(LAUNCH).getTime();

  return (
    <>
      <section className="inv-card">
        <div className="flex items-center justify-between"><span className="eyebrow">{tt("Alpha competition")}</span><span className={`adm-st ${s.hidden ? "warn" : "ok"}`}>{s.hidden ? "HIDDEN" : "LIVE"}</span></div>
        <p className="mt-1 text-[14px]"><b className="mono">{b?.count ?? "…"}</b><span className="muted"> / {s.goal} counted</span> · <span className="muted">{sinceLaunch ? tt("every fade since launch") : `fades since ${new Date(s.startAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`}</span></p>
        <p className="when mt-1">{tt("Counts each real person once who has placed a trade (any account, guests included). Demo bots never count.")}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button className="btn" style={{ padding: 10, fontSize: 13 }} disabled={sinceLaunch} onClick={() => save({ startAt: LAUNCH }, "Now counting everyone who has ever faded")}>{tt("Count since launch")}</button>
          <button className="btn" style={{ padding: 10, fontSize: 13 }} onClick={() => confirm(tt("Restart the count from zero, now?")) && save({ restart: true }, "Count restarted from now")}>{tt("Restart from now")}</button>
        </div>
        <button className="btn mt-2 w-full" style={{ padding: 10, fontSize: 13 }} onClick={() => save({ hidden: !s.hidden }, s.hidden ? "Bar is showing again" : "Bar hidden everywhere")}>{s.hidden ? tt("Show the bar") : tt("Hide the bar")}</button>
      </section>

      <section className="inv-card">
        <div className="flex items-center justify-between"><span className="eyebrow">{tt("Goal")}</span><span className="when">{tt("people needed to unlock")}</span></div>
        <div className="inv-input"><input value={goal} onChange={(e) => setGoal(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="100" /><button disabled={!Number(goal) || Number(goal) === s.goal} onClick={() => save({ goal: Number(goal) }, `Goal set to ${goal}`)}>{tt("Save")}</button></div>
      </section>

      <section className="inv-card">
        <div className="flex items-center justify-between"><span className="eyebrow">{tt("What unlocks")}</span><span className="when">{tt("shown once the bar is full")}</span></div>
        <textarea className="field mt-2" rows={4} maxLength={2000} value={details} onChange={(e) => setDetails(e.target.value)} placeholder={tt("The competition details people see at the goal")} />
        <div className="inv-input"><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={tt("Link to full details (optional)")} autoCapitalize="none" /><button
          disabled={(details === (s.details ?? "")) && (url === (s.detailsUrl ?? ""))}
          onClick={() => { if (url && !/^https?:\/\//.test(url)) return setMsg(tt("Links need to start with https://")); save({ details: details.trim() || null, detailsUrl: url.trim() || null }, "Details saved"); }}>{tt("Save")}</button></div>
      </section>

      {b?.recruiters?.length ? (
        <section className="inv-card">
          <span className="eyebrow">{tt("Top recruiters")}</span>
          {b.recruiters.map((r) => <div key={r.handle} className="adm-row"><b className="flex-1 text-[14px]">@{r.handle}</b><span className="mono">{r.n}</span></div>)}
        </section>
      ) : null}
      {msg && <p className="when mt-2 text-center">{msg}</p>}
    </>
  );
}

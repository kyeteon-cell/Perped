"use client";


import { tt } from "@/lib/i18n";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { useSession } from "@/lib/hooks/useSession";

type Picks = { fader: number; target: number; mine: "fader" | "target" | null; open: boolean; inIt: boolean; settled: boolean; winner: "fader" | "target" | null; xp: number; upsetXp: number };

/**
 * "Who wins?" on a fight: back a side for free, see the crowd split, get XP if your side comes in.
 * `fightId` is the fade post id (same as /battle/:id). Only loads once the card is on screen.
 */
export function PickWinner({ fightId, targetHandle, faderHandle, big = false }: { fightId: number; targetHandle: string; faderHandle: string; big?: boolean }) {
  const { profile, authedFetch, login } = useSession();
  const box = useRef<HTMLDivElement>(null);
  const [vis, setVis] = useState(big);
  useEffect(() => {
    if (vis) return; const el = box.current; if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setVis(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { setVis(true); io.disconnect(); } }, { rootMargin: "200px" });
    io.observe(el); return () => io.disconnect();
  }, [vis]);
  const key = vis ? `/api/battle/${fightId}/picks${profile ? `?u=${profile.id}` : ""}` : null;
  const { data, mutate } = useSWR<Picks>(key, { refreshInterval: big ? 20_000 : 60_000 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pop, setPop] = useState<string | null>(null);

  const total = (data?.fader ?? 0) + (data?.target ?? 0);
  const tPct = total ? Math.round(((data?.target ?? 0) / total) * 100) : 50;
  const pick = async (side: "fader" | "target", e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!profile) return login();
    if (busy || !data) return;
    setBusy(true); setErr(null);
    mutate({ ...data, mine: side, [side]: data[side] + 1 }, { revalidate: false });
    const r = await authedFetch(`/api/battle/${fightId}/picks`, { method: "POST", body: JSON.stringify({ pick: side }) }).catch(() => null);
    const j = r ? await r.json().catch(() => null) : null;
    setBusy(false);
    if (!r?.ok) { setErr(j?.error ?? "Couldn't save your pick"); mutate(); return; }
    setPop(side); try { navigator.vibrate?.(15); } catch {}
    mutate({ ...data, ...j, mine: side }, { revalidate: false });
  };

  if (!data) return <div ref={box} className={`pick ${big ? "big" : ""} loading`} />;
  const canPick = data.open && !data.inIt && !data.mine;
  // Nothing to show: nobody picked and you can't (you're in it, or picks have closed).
  if (!canPick && !total) return <div ref={box} />;
  const name = (s: "fader" | "target") => (s === "fader" ? faderHandle : targetHandle);
  const result = data.settled && data.mine ? (data.winner === data.mine ? "won" : data.winner ? "lost" : "draw") : null;
  return (
    <div ref={box} className={`pick ${big ? "big" : ""}`} onClick={(e) => e.stopPropagation()}>
      <div className="pick-h">
        <span>{canPick ? tt("Who wins?") : data.settled ? tt("The crowd picked") : data.mine ? `You picked @${name(data.mine)}` : data.inIt ? tt("Spectators picked") : tt("Picks closed")}</span>
        <span className="pick-xp">{canPick ? `+${data.xp} XP if right` : result === "won" ? tt("Your pick won") : result === "lost" ? tt("Your pick lost") : total ? `${total} pick${total === 1 ? "" : "s"}` : ""}</span>
      </div>
      {canPick ? (
        <div className="pick-btns">
          <button type="button" disabled={busy} onClick={(e) => pick("target", e)}>@{targetHandle}</button>
          <button type="button" disabled={busy} onClick={(e) => pick("fader", e)}>@{faderHandle}</button>
        </div>
      ) : (
        <div className="pick-split">
          <span className={`pick-l ${data.mine === "target" ? "me" : ""} ${pop === "target" ? "pop" : ""}`} style={{ width: `${Math.max(8, Math.min(92, tPct))}%` }}><b className="mono">{tPct}%</b> @{targetHandle}</span>
          <span className={`pick-r ${data.mine === "fader" ? "me" : ""} ${pop === "fader" ? "pop" : ""}`}><b className="mono">{100 - tPct}%</b> @{faderHandle}</span>
        </div>
      )}
      {canPick && <p className="pick-note">{tt("Free to pick. Calling the upset pays +")}{data.upsetXp}{" "}{tt("XP. Picks close when either side closes.")}</p>}
      {err && <p className="pick-err">{err}</p>}
    </div>
  );
}

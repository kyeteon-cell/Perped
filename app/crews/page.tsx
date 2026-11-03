"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Glyph } from "@/components/Glyph";
import { Icon, I, SkeletonList } from "@/components/ui";
import { Sheet } from "@/components/Sheet";
import { CrewBoard } from "@/components/CrewBoard";
import { useSession } from "@/lib/hooks/useSession";
import type { CrewCard } from "@/lib/crews";

type Res = { board: CrewCard[]; mine: { slug: string; name: string; tag: string; isOwner: boolean } | null; weekEndsAt: string };

const left = (iso: string) => { const ms = new Date(iso).getTime() - Date.now(); const d = Math.floor(ms / 86_400_000), h = Math.floor((ms % 86_400_000) / 3_600_000); return d > 0 ? `${d}d ${h}h` : `${Math.max(0, h)}h`; };

/** /crews — the weekly crew war, your crew, and starting one. */
export default function CrewsPage() {
  const { data, isLoading } = useSWR<Res>("/api/crews", { refreshInterval: 60_000 });
  const { authenticated, login, profile } = useSession();
  const [creating, setCreating] = useState(false);
  return (
    <div className="fade-in pb-8" data-tint="gold">
      <header className="flex items-center justify-between px-4 py-3"><Link href="/leaderboard" className="iconbtn" aria-label="Back"><Icon d={I.back} /></Link><h1 className="text-xl font-bold">Crews</h1><span className="w-9" /></header>
      <div className="px-4">
        <section className="crew-war-hero">
          <small>Crew war · week ends in {data ? left(data.weekEndsAt) : "…"}</small>
          <h2>Bring your group. Beat the others.</h2>
          <p>Every fade a member wins against someone outside the crew scores a point; every one they lose takes one away. Resets Monday 00:00 UTC.</p>
          {data?.mine ? (
            <Link href={`/crew/${data.mine.slug}`} className="crew-war-cta">Open {data.mine.name} →</Link>
          ) : (
            <button className="crew-war-cta" onClick={() => (authenticated && profile ? setCreating(true) : login())}><span className="gl"><Glyph n="people" />Start a crew</span></button>
          )}
        </section>
      </div>
      <div className="eyebrow px-5 pb-1.5 pt-5">This week</div>
      {isLoading && !data ? <SkeletonList n={4} card={false} /> : <CrewBoard board={data?.board ?? []} mine={data?.mine?.slug} />}
      <p className="muted px-5 py-3.5 text-xs leading-relaxed">Fades inside a crew don&rsquo;t count. Ties go to the crew with more wins, then the better 7-day PnL. Demo trades count during Season 0.</p>
      {creating && <CreateCrew onClose={() => setCreating(false)} />}
    </div>
  );
}

function CreateCrew({ onClose }: { onClose: () => void }) {
  const { authedFetch } = useSession();
  const router = useRouter();
  const [name, setName] = useState(""), [tag, setTag] = useState(""), [bio, setBio] = useState("");
  const [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null);
  const autoTag = (n: string) => n.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase();
  const ok = name.trim().length >= 3 && /^[A-Z0-9]{2,5}$/.test(tag);
  const go = async () => {
    setBusy(true); setErr(null);
    const r = await authedFetch("/api/crews", { method: "POST", body: JSON.stringify({ name, tag, bio }) }).then((x) => x.json()).catch(() => ({ error: "Try again" }));
    setBusy(false);
    if (r.slug) { onClose(); router.push(`/crew/${r.slug}`); } else setErr(r.error ?? "Couldn't start the crew");
  };
  return (
    <Sheet label="Start a crew" onClose={onClose}>
      <div className="px-5 pb-6">
        <h3 className="text-lg font-extrabold">Start a crew</h3>
        <p className="when mt-1">Your group on Perped. Anyone who joins with your crew link is credited to you, and your trades can post straight into your Telegram group.</p>
        <label className="crew-lbl">Name</label>
        <input className="field" maxLength={28} value={name} placeholder="Kilo Klips" onChange={(e) => { const v = e.target.value; setName(v); if (!tag || tag === autoTag(name)) setTag(autoTag(v)); }} />
        <label className="crew-lbl">Tag <span className="when">2–5 letters, shown next to members&rsquo; names</span></label>
        <input className="field mono" maxLength={5} value={tag} placeholder="KILO" onChange={(e) => setTag(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} />
        <label className="crew-lbl">About <span className="when">optional</span></label>
        <textarea className="field" rows={2} maxLength={160} value={bio} placeholder="What your crew trades and how" onChange={(e) => setBio(e.target.value)} />
        {err && <p className="red mt-2 text-sm">{err}</p>}
        <button className="btn ink mt-4 w-full" style={{ padding: 14 }} disabled={!ok || busy} onClick={go}>{busy ? "Starting…" : "Start the crew"}</button>
      </div>
    </Sheet>
  );
}

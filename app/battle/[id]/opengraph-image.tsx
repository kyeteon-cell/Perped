import { ImageResponse } from "next/og";
import { eq } from "drizzle-orm";
import { db, schema, ensureSchema } from "@/lib/db";
import { getMids } from "@/lib/hl-info";
import { pnlForPosition } from "@/lib/format";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "A battle on Perped";

type P = typeof schema.posts.$inferSelect;
const roiOf = (p: P, mid: number) => {
  const entry = Number(p.entryPx), mark = p.status === "closed" ? Number(p.exitPx ?? entry) : mid || entry;
  return pnlForPosition(p.side as "long" | "short", entry, mark, Number(p.size)).pct * (p.leverage ?? 1);
};
const pct = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}%`;
const GREEN = "#05e091", RED = "#fd6267", GOLD = "#f2b63a";

/** The battle as a share card: both traders, their sides and leverage, live ROI, who's ahead. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await ensureSchema();
  const [fade] = await db.select().from(schema.posts).where(eq(schema.posts.id, Number(id))).limit(1);
  const [target] = fade?.fadedFromId ? await db.select().from(schema.posts).where(eq(schema.posts.id, fade.fadedFromId)).limit(1) : [];
  if (!fade || !target) {
    return new ImageResponse(<div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0b0c0e", color: "#fff", fontSize: 72, fontWeight: 800 }}>perped.</div>, size);
  }
  const [[fu], [tu], [battle], mids] = await Promise.all([
    db.select({ handle: schema.users.handle }).from(schema.users).where(eq(schema.users.id, fade.userId!)).limit(1),
    db.select({ handle: schema.users.handle }).from(schema.users).where(eq(schema.users.id, target.userId!)).limit(1),
    db.select().from(schema.battles).where(eq(schema.battles.faderPostId, fade.id)).limit(1),
    getMids().catch(() => ({} as Record<string, string>)),
  ]);
  const coin = fade.coin ?? "";
  const mid = Number(mids[coin] ?? 0);
  const settled = battle?.status === "settled";
  const a = settled ? Number(battle!.faderRoi) : roiOf(fade, mid), b = settled ? Number(battle!.targetRoi) : roiOf(target, mid);
  const aLead = settled ? battle!.winnerId === fade.userId : a > b, bLead = settled ? battle!.winnerId === target.userId : b > a;
  const gap = Math.abs(a - b);
  const status = settled ? "SETTLED" : fade.status === "open" && target.status === "open" ? "LIVE" : "CHASE ON";

  const Side = ({ handle, p, roi, lead }: { handle: string; p: P; roi: number; lead: boolean }) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 430, padding: "28px 0", borderRadius: 36, background: lead ? "rgba(242,182,58,0.13)" : "rgba(255,255,255,0.04)", border: lead ? `3px solid ${GOLD}` : "3px solid rgba(255,255,255,0.08)" }}>
      <div style={{ display: "flex", width: 120, height: 120, borderRadius: 999, alignItems: "center", justifyContent: "center", fontSize: 56, fontWeight: 800, color: "#0b0c0e", backgroundImage: "linear-gradient(135deg, #ffffff, #c9ccd1 55%, #858a92)", border: `6px solid ${p.side === "long" ? GREEN : RED}` }}>{handle.slice(0, 1).toUpperCase()}</div>
      <div style={{ display: "flex", marginTop: 16, fontSize: 40, fontWeight: 800, color: lead ? GOLD : "#f4f5f7" }}>{handle}</div>
      <div style={{ display: "flex", marginTop: 10, padding: "6px 18px", borderRadius: 999, fontSize: 26, fontWeight: 800, color: p.side === "long" ? GREEN : RED, background: p.side === "long" ? "rgba(5,224,145,0.14)" : "rgba(253,98,103,0.14)" }}>{p.side === "long" ? "Long" : "Short"} {p.leverage}×</div>
      <div style={{ display: "flex", marginTop: 14, fontSize: 76, fontWeight: 800, letterSpacing: -2, color: roi >= 0 ? GREEN : RED }}>{pct(roi)}</div>
      {lead ? <div style={{ display: "flex", marginTop: 4, fontSize: 24, fontWeight: 800, color: GOLD, letterSpacing: 4 }}>{settled ? "WINNER" : "AHEAD"}</div> : null}
    </div>
  );

  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: "40px 56px", color: "#fff",
      backgroundColor: "#0b0c0e", backgroundImage: "radial-gradient(circle at 0% 100%, rgba(5,224,145,0.28), rgba(5,224,145,0) 55%), radial-gradient(circle at 100% 0%, rgba(253,98,103,0.26), rgba(253,98,103,0) 55%)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", fontSize: 48, fontWeight: 900, letterSpacing: -1 }}>perped.</div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 28, fontWeight: 800, letterSpacing: 3, color: "#c9ccd1" }}>
          <div style={{ display: "flex", width: 14, height: 14, borderRadius: 99, background: status === "SETTLED" ? "#6e727a" : GOLD }} />{`BATTLE · ${coin} · ${status}`}
        </div>
      </div>
      <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "space-between", marginTop: 18 }}>
        <Side handle={fu?.handle ?? "?"} p={fade} roi={a} lead={aLead} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 64, fontWeight: 900, fontStyle: "italic", color: "#c9ccd1" }}>VS</div>
          <div style={{ display: "flex", marginTop: 8, fontSize: 34, fontWeight: 800, color: GOLD }}>{gap.toFixed(1)}%</div>
          <div style={{ display: "flex", fontSize: 20, fontWeight: 700, color: "#9a9ea6", letterSpacing: 3 }}>GAP</div>
        </div>
        <Side handle={tu?.handle ?? "?"} p={target} roi={b} lead={bLead} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18, fontSize: 26, fontWeight: 700, color: "#9a9ea6" }}>
        <div style={{ display: "flex" }}>{`${fu?.handle ?? "?"} faded ${tu?.handle ?? "?"}`}</div>
        <div style={{ display: "flex", color: "#f4f5f7" }}>Pick a side on Perped</div>
      </div>
    </div>,
    size,
  );
}

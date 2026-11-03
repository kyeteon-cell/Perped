"use client";

import { useState } from "react";
import useSWR from "swr";
import { stringToHex } from "viem";
import { CoinMark } from "./ui";
import { useSession } from "@/lib/hooks/useSession";
import { fmtUsd } from "@/lib/format";
import { linkMessage, type HlRecord } from "@/lib/hl-link";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const since = (ms: number | null) => (ms ? new Date(ms).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "—");
const pnlCls = (n: number) => (n > 0 ? "green" : n < 0 ? "red" : "");

/** The verified Hyperliquid track record on a profile: what this wallet has done, read straight from the chain. */
export function HlRecordCard({ r }: { r: HlRecord & { verifiedAt?: string } }) {
  return (
    <section className="hlr">
      <div className="hlr-h">
        <span className="hlr-badge">Verified on Hyperliquid</span>
        <a className="hlr-wallet mono" href={`https://hypurrscan.io/address/${r.address}`} target="_blank" rel="noreferrer">{short(r.address)} ↗</a>
      </div>
      <div className="hlr-grid">
        <div><small>All-time PnL</small><b className={`mono ${pnlCls(r.pnlAll)}`}>{fmtUsd(r.pnlAll, { sign: true, compact: true })}</b></div>
        <div><small>Last 30 days</small><b className={`mono ${pnlCls(r.pnl30d)}`}>{fmtUsd(r.pnl30d, { sign: true, compact: true })}</b></div>
        <div><small>Volume</small><b className="mono">{fmtUsd(r.volumeAll, { compact: true })}</b></div>
        <div><small>Win rate</small><b className="mono">{r.closes ? `${Math.round(r.winRate)}%` : "—"}</b><span>{r.closes ? `${r.closes.toLocaleString("en-US")} closes` : "no closes yet"}</span></div>
      </div>
      <div className="hlr-foot">
        <span>Trading since {since(r.since)}</span>
        {r.topCoins.length > 0 && <span className="hlr-coins">{r.topCoins.map((c) => <CoinMark key={c.coin} coin={c.coin} size="xs" />)}<span className="when">{r.topCoins.map((c) => c.coin).join(" · ")}</span></span>}
      </div>
      {r.best && <div className="hlr-best">Best close: <b>{r.best.coin}</b> <b className="mono green">{fmtUsd(r.best.pnl, { sign: true, compact: true })}</b></div>}
    </section>
  );
}

type Eth = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };

/** Settings: link the wallet you trade from on Hyperliquid by signing a message, so your history shows on your profile. */
export function HlImportSettings() {
  const { profile, authedFetch, walletClient, hasExternalWallet, linkWallet } = useSession();
  const { data, mutate } = useSWR<{ record: { address: string; summary: HlRecord; refreshedAt: string } | null }>(profile ? "/api/me/hl-import" : null, (u: string) => authedFetch(u).then((r) => r.json()));
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const eth = typeof window !== "undefined" ? (window as unknown as { ethereum?: Eth }).ethereum : undefined;
  if (!profile) return null;
  const rec = data?.record;

  const submit = async (address: string, sign: (message: string) => Promise<string>) => {
    setErr(null); setBusy("Waiting for your signature…");
    try {
      const issued = new Date().toISOString();
      const signature = await sign(linkMessage(address, profile.handle, issued));
      setBusy("Reading your Hyperliquid history…");
      const r = await authedFetch("/api/me/hl-import", { method: "POST", body: JSON.stringify({ address, issued, signature }) }).then((x) => x.json());
      if (r.error) setErr(r.error); else await mutate();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setErr(/reject|denied|cancel/i.test(m) ? "Signature cancelled" : "Couldn't get a signature from that wallet");
    }
    setBusy(null);
  };
  const withConnected = () => {
    const acct = walletClient?.account;
    if (!walletClient || !acct) return;
    void submit(acct.address.toLowerCase(), (message) => walletClient.signMessage({ account: acct, message }));
  };
  const withBrowserWallet = async () => {
    if (!eth) return;
    try {
      const [addr] = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      if (!addr) return;
      void submit(addr.toLowerCase(), (message) => eth.request({ method: "personal_sign", params: [stringToHex(message), addr] }) as Promise<string>);
    } catch { setErr("Your browser wallet didn't connect"); }
  };

  return (
    <div className="hli">
      {rec ? (
        <>
          <div className="srow"><span>Hyperliquid record<span className="when ml-1.5">{short(rec.address)} · on your profile</span></span><span className={`mono ${pnlCls(rec.summary.pnlAll)}`}>{fmtUsd(rec.summary.pnlAll, { sign: true, compact: true })}</span></div>
          <div className="hli-acts">
            <button className="chip" disabled={!!busy} onClick={async () => { setBusy("Refreshing…"); await authedFetch("/api/me/hl-import", { method: "PATCH" }); await mutate(); setBusy(null); }}>Refresh</button>
            <button className="chip" disabled={!!busy} onClick={async () => { await authedFetch("/api/me/hl-import", { method: "DELETE" }); await mutate(); }}>Remove from profile</button>
          </div>
        </>
      ) : (
        <div className="hli-card">
          <b>Bring your Hyperliquid track record</b>
          <p>Already trade on Hyperliquid? Sign a message with that wallet and your all-time PnL, volume and win rate show on your profile, verified on-chain. Signing can&rsquo;t move funds.</p>
          <div className="hli-acts">
            {hasExternalWallet && walletClient?.account ? <button className="btn ink" disabled={!!busy} onClick={withConnected}>Use {short(walletClient.account.address)}</button>
              : <button className="btn ink" disabled={!!busy} onClick={linkWallet}>Connect a wallet</button>}
            {eth && <button className="btn" disabled={!!busy} onClick={withBrowserWallet}>A different wallet</button>}
          </div>
        </div>
      )}
      {busy && <p className="when px-5 pt-1.5 text-[12px]">{busy}</p>}
      {err && <p className="red px-5 pt-1.5 text-[12px]">{err}</p>}
    </div>
  );
}

"use client";

import { useSession } from "@/lib/hooks/useSession";
import { APP_NAME, HL_NETWORK } from "@/lib/config";

export function Header({ title, right }: { title?: string; right?: React.ReactNode }) {
  const { authenticated, login, logout, ready } = useSession();
  return (
    <header className="mb-4 flex items-center justify-between">
      <div>
        <h1 className="text-xl font-black tracking-tight">
          {title ?? APP_NAME}
          {HL_NETWORK === "testnet" && <span className="pill ml-2 align-middle" style={{ background: "var(--accent)", color: "#1a1200" }}>testnet</span>}
        </h1>
      </div>
      <div className="flex items-center gap-2">
        {right}
        {ready && (authenticated ? (
          <button onClick={logout} className="btn btn-ghost !px-3 !py-2 text-xs">Log out</button>
        ) : (
          <button onClick={login} className="btn btn-accent !px-3 !py-2 text-xs">Log in</button>
        ))}
      </div>
    </header>
  );
}

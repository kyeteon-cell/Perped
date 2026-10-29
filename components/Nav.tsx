"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/hooks/useSession";

const tabs = [
  { href: "/", label: "Feed", icon: "📈" },
  { href: "/trade", label: "Trade", icon: "⚡" },
  { href: "/leaderboard", label: "Board", icon: "🏆" },
];

export function Nav() {
  const path = usePathname();
  const { authenticated, profile, login } = useSession();
  const me = profile ? `/u/${profile.handle}` : null;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t" style={{ background: "var(--panel)", borderColor: "var(--line)" }}>
      <div className="mx-auto grid max-w-md grid-cols-4 sm:max-w-2xl" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} className={`flex flex-col items-center gap-0.5 py-2 text-xs ${path === t.href ? "" : "muted"}`}>
            <span className="text-lg">{t.icon}</span>
            {t.label}
          </Link>
        ))}
        {authenticated && me ? (
          <Link href={me} className={`flex flex-col items-center gap-0.5 py-2 text-xs ${path.startsWith("/u/") ? "" : "muted"}`}>
            <span className="text-lg">👤</span>Me
          </Link>
        ) : (
          <button onClick={login} className="muted flex flex-col items-center gap-0.5 py-2 text-xs">
            <span className="text-lg">🔑</span>Log in
          </button>
        )}
      </div>
    </nav>
  );
}

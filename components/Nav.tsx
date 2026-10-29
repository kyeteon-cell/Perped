"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/hooks/useSession";

const I = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const tabs = [
  { href: "/", label: "Feed", icon: <I d="M3 17l6-6 4 4 8-8M14 7h7v7" /> },
  { href: "/markets", label: "Trade", icon: <I d="M13 2L4 14h7l-1 8 9-12h-7z" /> },
  { href: "/leaderboard", label: "Board", icon: <I d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 6h3a3 3 0 0 1-3 3M7 6H4a3 3 0 0 0 3 3" /> },
];
const userIcon = <I d="M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM4 21a8 8 0 0 1 16 0" />;
const keyIcon = <I d="M15 7a4 4 0 1 1-2.6 7l-1.4 1.4V17H9v2H7v2H3v-4l6.6-6.6A4 4 0 0 1 15 7z" />;

export function Nav() {
  const path = usePathname();
  const { authenticated, profile, login } = useSession();
  const me = profile ? `/u/${profile.handle}` : null;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t" style={{ background: "var(--panel)", borderColor: "var(--line)" }}>
      <div className="mx-auto grid max-w-md grid-cols-4 sm:max-w-2xl" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} className={`flex flex-col items-center gap-1 py-2 text-[11px] font-medium ${path === t.href || (t.href === "/markets" && (path.startsWith("/markets") || path === "/trade")) ? "" : "muted"}`}>
            {t.icon}
            {t.label}
          </Link>
        ))}
        {authenticated && me ? (
          <Link href={me} className={`flex flex-col items-center gap-1 py-2 text-[11px] font-medium ${path.startsWith("/u/") ? "" : "muted"}`}>
            {userIcon}Me
          </Link>
        ) : (
          <button onClick={login} className="muted flex flex-col items-center gap-1 py-2 text-[11px] font-medium">
            {keyIcon}Log in
          </button>
        )}
      </div>
    </nav>
  );
}

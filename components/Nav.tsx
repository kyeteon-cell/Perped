"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/lib/hooks/useSession";
import { Icon, I } from "./ui";

const tabs = [
  { href: "/", label: "Home", icon: I.home, tint: "brand", match: (p: string) => p === "/" || p.startsWith("/post") },
  { href: "/markets", label: "Markets", icon: I.markets, tint: "blue", match: (p: string) => p.startsWith("/markets") || p === "/trade" },
  { href: "/leaderboard", label: "Leaders", icon: I.trophy, tint: "gold", match: (p: string) => p.startsWith("/leaderboard") },
];

export function Nav() {
  const path = usePathname();
  const router = useRouter();
  const { authenticated, profile, profileLoading, address, login } = useSession();
  // A logged-in user with a wallet but no handle yet goes through onboarding.
  useEffect(() => {
    if (authenticated && address && !profileLoading && !profile && !path.startsWith("/onboarding")) router.replace("/onboarding");
  }, [authenticated, address, profileLoading, profile, path, router]);
  if (path.startsWith("/onboarding")) return null;
  const me = profile ? `/u/${profile.handle}` : null;
  const meOn = path.startsWith("/u/") || path.startsWith("/settings") || path.startsWith("/notifications");
  return (
    <nav className="nav" aria-label="Tabs">
      <div className="nav-inner">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} className={t.match(path) ? "on" : ""} data-t={t.tint}>
            <Icon d={t.icon} size={24} />{t.label}
          </Link>
        ))}
        {authenticated && me ? (
          <Link href={me} className={meOn ? "on" : ""} data-t="violet"><Icon d={I.user} size={24} />You</Link>
        ) : (
          <a href="#" onClick={(e) => { e.preventDefault(); login(); }} data-t="violet"><Icon d={I.user} size={24} />Log in</a>
        )}
      </div>
    </nav>
  );
}

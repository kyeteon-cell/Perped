"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/lib/hooks/useSession";
import { Icon, I } from "./ui";

const tabs = [
  { href: "/", label: "Home", icon: I.home, tint: "brand", match: (p: string) => p === "/" || p.startsWith("/post") },
  { href: "/markets", label: "Markets", icon: I.markets, tint: "blue", match: (p: string) => p.startsWith("/markets") || p === "/trade" },
  { href: "/arena", label: "Arena", icon: I.bolt, tint: "red", match: (p: string) => p.startsWith("/arena") || p.startsWith("/battle") || p.startsWith("/duels") },
  { href: "/leaderboard", label: "Leaders", icon: I.trophy, tint: "gold", match: (p: string) => p.startsWith("/leaderboard") },
];

export function Nav() {
  const path = usePathname();
  const router = useRouter();
  const { authenticated, profile, profileLoading, address, login, loginError } = useSession();
  // A logged-in user with a wallet but no handle yet goes through onboarding.
  useEffect(() => {
    let linking = false;
    try { linking = !!sessionStorage.getItem("perped:link-x"); } catch {}
    if (linking) return; // attaching X to a guest account: the profile appears once the link lands
    if (authenticated && address && !profileLoading && !profile && !path.startsWith("/onboarding")) router.replace("/onboarding");
  }, [authenticated, address, profileLoading, profile, path, router]);
  if (path.startsWith("/onboarding")) return null;
  const me = profile ? `/u/${profile.handle}` : null;
  const meOn = path.startsWith("/u/") || path.startsWith("/settings") || path.startsWith("/notifications");
  return (
    <>{loginError && <div className="fixed inset-x-0 top-0 z-50 px-4 py-2 text-center text-xs" style={{ background: "var(--red-soft)", color: "var(--red)" }}>{loginError}</div>}<nav className="nav" aria-label="Tabs">
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
    </nav></>
  );
}

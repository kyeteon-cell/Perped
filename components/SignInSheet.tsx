"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignInOptions } from "./SignInOptions";
import { Sheet } from "./Sheet";
import { useSession } from "@/lib/hooks/useSession";

/** Bottom sheet with Perped's sign-in options. Opens on the "perped:login" event (any bare login() call). */
export function SignInSheet() {
  const [open, setOpen] = useState(false);
  const { authenticated } = useSession();
  const path = usePathname();
  useEffect(() => {
    const h = () => setOpen(true);
    window.addEventListener("perped:login", h);
    return () => window.removeEventListener("perped:login", h);
  }, []);
  useEffect(() => { if (authenticated) setOpen(false); }, [authenticated]);
  useEffect(() => { setOpen(false); }, [path]);
  if (!open) return null;
  return (
    <Sheet label="Sign in" onClose={() => setOpen(false)}>
        <div className="px-5 pb-6">
          <h2 className="text-lg font-bold">Get in</h2>
          <p className="muted mb-3 text-sm">Demo to practise, wallet to trade for real.</p>
          <SignInOptions />
          <p className="faint mt-3 text-center text-[11px]"><Link href="/how-it-works">How it works · where your money is · fees</Link></p>
        </div>
    </Sheet>
  );
}

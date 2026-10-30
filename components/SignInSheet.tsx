"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { SignInOptions } from "./SignInOptions";
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
    <>
      <div className="sheet-bg" onClick={() => setOpen(false)} />
      <div className="sheet" role="dialog" aria-label="Sign in">
        <div className="grab" />
        <div className="px-5 pb-6">
          <h2 className="text-lg font-bold">Get in</h2>
          <p className="muted mb-3 text-sm">Demo to practise, wallet to trade for real.</p>
          <SignInOptions />
        </div>
      </div>
    </>
  );
}

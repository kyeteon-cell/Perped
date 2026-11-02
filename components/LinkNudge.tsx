"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/lib/hooks/useSession";

const KEY = "perped:link-nudge";

/**
 * After a guest's fade: one line asking them to link X or Google, because instant guest accounts don't
 * count toward the alpha competition (and can be lost with the browser). Dismissed for good with ×.
 */
export function LinkNudge() {
  const { isGuest } = useSession();
  const [hide, setHide] = useState(true);
  useEffect(() => { try { setHide(!!localStorage.getItem(KEY)); } catch { setHide(false); } }, []);
  if (!isGuest || hide) return null;
  return (
    <div className="link-nudge" role="note">
      <span><b>Make this fade count.</b> Link X or Google so you count toward the alpha competition and keep your record.</span>
      <Link href="/settings" className="link-nudge-go">Link</Link>
      <button type="button" aria-label="Dismiss" onClick={() => { setHide(true); try { localStorage.setItem(KEY, "1"); } catch {} }}>×</button>
    </div>
  );
}

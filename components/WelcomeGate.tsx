"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

// The welcome (with its trade ticket) only downloads for people who'll actually see it.
const Welcome = dynamic(() => import("./Welcome").then((m) => m.Welcome), { ssr: false });

/** Shown once per device on first open, or with ?welcome=1 (Settings → Replay the walkthrough). */
export function WelcomeGate() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      const replay = new URLSearchParams(window.location.search).get("welcome") === "1";
      if (replay || !localStorage.getItem("perped:intro-seen")) setShow(true);
      if (replay) window.history.replaceState(null, "", window.location.pathname);
    } catch {}
  }, []);
  if (!show) return null;
  return <Welcome onClose={() => setShow(false)} />;
}

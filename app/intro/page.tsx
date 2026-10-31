"use client";

import { useRouter } from "next/navigation";
import { Intro } from "@/components/Intro";

/** /intro — the 60-second tour, any time. */
export default function IntroPage() {
  const router = useRouter();
  return <div className="fade-in"><Intro onDone={() => router.push("/")} doneLabel="Go to the feed" /></div>;
}

"use client";

import useSWR from "swr";
import { ALERT_GROUPS, type AlertPrefs } from "@/lib/alerts";
import { useSession } from "@/lib/hooks/useSession";

/** Settings: which alerts push to your phone. Everything still shows in Notifications. */
export function AlertSettings() {
  const { authenticated, authedFetch } = useSession();
  const { data, mutate } = useSWR<{ prefs: AlertPrefs }>(authenticated ? "/api/me/alerts" : null);
  if (!authenticated) return null;
  const prefs = data?.prefs ?? {};
  const flip = async (key: string, on: boolean) => {
    mutate({ prefs: { ...prefs, [key]: on } }, { revalidate: false });
    const r = await authedFetch("/api/me/alerts", { method: "POST", body: JSON.stringify({ group: key, on }) }).then((x) => x.json()).catch(() => null);
    mutate(r?.prefs ? { prefs: r.prefs } : undefined);
  };
  return (
    <div className="alr">
      <div className="eyebrow">Phone alerts</div>
      <p className="when mt-1">Choose what buzzes your phone. Everything still shows in Notifications.</p>
      {ALERT_GROUPS.map((g) => {
        const on = prefs[g.key] !== false;
        return (
          <label key={g.key} className="alr-row">
            <span><b>{g.label}</b><small>{g.desc}</small></span>
            <button type="button" role="switch" aria-checked={on} className={`alr-sw ${on ? "on" : ""}`} onClick={() => flip(g.key, !on)}><i /></button>
          </label>
        );
      })}
    </div>
  );
}

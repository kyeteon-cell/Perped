"use client";


import { tt } from "@/lib/i18n";
import { useRef, useState } from "react";
import { useSession } from "@/lib/hooks/useSession";
import { Avatar } from "./ui";

/** Shrink an image in the browser to a JPEG data URL that fits the upload limit. */
async function shrink(file: File, w: number, h: number): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d")!;
    // cover-fit crop
    const s = Math.max(w / img.width, h / img.height); const dw = img.width * s, dh = img.height * s;
    g.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    let q = 0.86, out = c.toDataURL("image/jpeg", q);
    const cap = w === h ? 380_000 : 1_000_000;
    while ((out.length * 3) / 4 > cap && q > 0.4) { q -= 0.1; out = c.toDataURL("image/jpeg", q); }
    return out;
  } finally { URL.revokeObjectURL(url); }
}

/** Avatar + banner + bio editing. Images are resized on the phone before upload, so it's quick on mobile data. */
export function ProfileEditor() {
  const { profile, authedFetch, refreshMe } = useSession();
  const avatarIn = useRef<HTMLInputElement>(null), bannerIn = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [bio, setBio] = useState(profile?.bio ?? "");
  if (!profile) return null;

  const upload = async (kind: "avatar" | "banner", file: File | null) => {
    if (!file) return;
    setBusy(kind); setErr(null);
    try {
      const dataUrl = kind === "avatar" ? await shrink(file, 512, 512) : await shrink(file, 1500, 500);
      const r = await authedFetch("/api/me/media", { method: "POST", body: JSON.stringify({ kind, dataUrl }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Upload failed");
      await refreshMe();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(null);
  };
  const clear = async (kind: "avatar" | "banner") => {
    setBusy(kind); setErr(null);
    await authedFetch("/api/me/media", { method: "POST", body: JSON.stringify({ kind, dataUrl: null }) });
    await refreshMe(); setBusy(null);
  };
  const saveBio = async () => {
    if (bio === (profile.bio ?? "")) return;
    const r = await authedFetch("/api/me", { method: "POST", body: JSON.stringify({ handle: profile.handle, bio }) });
    if (!r.ok) setErr(tt("Couldn't save bio")); else refreshMe();
  };

  return (
    <section id="profile">
      <div className="eyebrow px-5 pb-1.5 pt-3.5">{tt("Profile")}</div>
      <div className="px-5">
        <div className="pe-banner" style={{ backgroundImage: profile.bannerUrl ? `url(${profile.bannerUrl})` : undefined }} onClick={() => bannerIn.current?.click()} role="button" aria-label={tt("Change banner")}>
          <span className="pe-hint">{busy === "banner" ? tt("Uploading…") : profile.bannerUrl ? tt("Tap to change banner") : tt("Tap to add a banner")}</span>
        </div>
        <div className="-mt-9 flex items-end gap-3 px-2">
          <button type="button" className="pe-av" onClick={() => avatarIn.current?.click()} aria-label={tt("Change profile picture")}>
            <Avatar handle={profile.handle} url={profile.avatarUrl} size={76} link={false} />
            <span className="pe-cam">{busy === "avatar" ? "…" : <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-label={tt("Change photo")}><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></svg>}</span>
          </button>
          <div className="flex flex-wrap gap-2 pb-1">
            <button className="chip" onClick={() => avatarIn.current?.click()}>{tt("Change photo")}</button>
            {profile.avatarUrl && <button className="chip" onClick={() => clear("avatar")}>{tt("Remove")}</button>}
            {profile.bannerUrl && <button className="chip" onClick={() => clear("banner")}>{tt("Remove banner")}</button>}
          </div>
        </div>
        <input ref={avatarIn} type="file" accept="image/*" hidden onChange={(e) => upload("avatar", e.target.files?.[0] ?? null)} />
        <input ref={bannerIn} type="file" accept="image/*" hidden onChange={(e) => upload("banner", e.target.files?.[0] ?? null)} />
        <div className="mt-3">
          <div className="eyebrow mb-1.5" style={{ color: "var(--muted)" }}>{tt("Bio")}</div>
          <input className="field" value={bio} maxLength={160} placeholder={tt("One line about how you trade")} onChange={(e) => setBio(e.target.value)} onBlur={saveBio} />
        </div>
        {err && <p className="red mt-2 text-xs">{err}</p>}
        <p className="faint mt-2 text-[11px]">{tt("Photos are resized on your phone before upload. Square photo for the picture, wide for the banner.")}</p>
      </div>
    </section>
  );
}

/** Photo backgrounds for share cards. Served same-origin through /api/share-bg/:key so the canvas can export them. */
export const SHARE_BACKGROUNDS: { key: string; name: string; url: string; textColor: string; muted: string; accent: string; scrim: "top" | "left" | "full" }[] = [
  { key: "gold", name: "Molten gold", url: "https://d8j0ntlcm91z4.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/hf_20261030_101451_d95da0b5-ff66-442b-88bd-d1acee075c90.png", textColor: "#fff", muted: "rgba(255,255,255,.72)", accent: "#ffd166", scrim: "top" },
  { key: "candles", name: "Neon candles", url: "https://d8j0ntlcm91z4.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/hf_20261030_101450_4df0bbb2-9f26-4e0d-b661-bfb92c74c0ca.png", textColor: "#fff", muted: "rgba(255,255,255,.7)", accent: "#4ade80", scrim: "left" },
  { key: "jackpot", name: "Jackpot", url: "https://d8j0ntlcm91z4.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/hf_20261030_101621_cd3390c2-5b63-4cdf-885a-a064aa518f7f.png", textColor: "#fff", muted: "rgba(255,255,255,.72)", accent: "#ffd166", scrim: "top" },
  { key: "holo", name: "Holo chrome", url: "https://d8j0ntlcm91z4.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/hf_20261030_101451_41788419-3fdf-436d-989a-5957b4c19344.png", textColor: "#fff", muted: "rgba(255,255,255,.75)", accent: "#fff", scrim: "full" },
  { key: "rocket", name: "Rocket", url: "https://d8j0ntlcm91z4.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/hf_20261030_101451_fec2a7ae-bc7f-49d1-a4b9-339490978401.png", textColor: "#fff", muted: "rgba(255,255,255,.7)", accent: "#4ade80", scrim: "top" },
  { key: "bar", name: "Gold bar", url: "https://d8j0ntlcm91z4.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/hf_20261030_101451_31e520f4-7a0f-4fe0-a03f-a863207d1249.png", textColor: "#fff", muted: "rgba(255,255,255,.72)", accent: "#ffd166", scrim: "top" },
];

/** Hero banner backgrounds (16:9). Served through the same /api/share-bg/:key proxy. */
export const HERO_BACKGROUNDS = [
  { key: "hero-droplets", name: "Chrome droplets", url: "https://d8j0ntlcm91z4.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/hf_20261030_131432_c1325a0b-3c8b-4d1a-ae12-c3878c09c5aa.png" },
  { key: "hero-fightnight", name: "Fight night", url: "https://d8j0ntlcm91z4.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/hf_20261030_131121_3bf994e3-0ac8-4fd5-92b3-e218bd132082.png" },
  { key: "hero-chrome", name: "Liquid chrome", url: "https://d8j0ntlcm91z4.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/hf_20261030_131121_865ca019-fe8e-4e99-a79d-c6bb2155fb3f.png" },
];

/** Photo backgrounds for share cards. Served same-origin through /api/share-bg/:key so the canvas can export them. */
export const SHARE_BACKGROUNDS: { key: string; name: string; url: string; textColor: string; muted: string; accent: string; scrim: "top" | "left" | "full" | "light" }[] = [
  { key: "mercury", name: "Mercury", url: "https://d8j0ntlcm91z4.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/hf_20261031_005330_51a43a67-696c-41e3-9f26-0f0e7a75b1de.png", textColor: "#fff", muted: "rgba(255,255,255,.75)", accent: "#05E091", scrim: "left" },
  { key: "liquid", name: "Liquid chrome", url: "https://d8j0ntlcm91z4.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/hf_20261031_005329_50666ccb-af22-40a2-9947-cb938fe0b268.png", textColor: "#fff", muted: "rgba(255,255,255,.75)", accent: "#05E091", scrim: "left" },
  { key: "paper", name: "Paper", url: "", textColor: "#111214", muted: "#6e727a", accent: "#04B877", scrim: "light" },

  { key: "gold", name: "Molten gold", url: "https://d8j0ntlcm91z4.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/hf_20261030_101451_d95da0b5-ff66-442b-88bd-d1acee075c90.png", textColor: "#fff", muted: "rgba(255,255,255,.72)", accent: "#ffd166", scrim: "top" },
  { key: "candles", name: "Neon candles", url: "https://d8j0ntlcm91z4.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/hf_20261030_101450_4df0bbb2-9f26-4e0d-b661-bfb92c74c0ca.png", textColor: "#fff", muted: "rgba(255,255,255,.7)", accent: "#4ade80", scrim: "left" },
  { key: "jackpot", name: "Jackpot", url: "https://d8j0ntlcm91z4.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/hf_20261030_101621_cd3390c2-5b63-4cdf-885a-a064aa518f7f.png", textColor: "#fff", muted: "rgba(255,255,255,.72)", accent: "#ffd166", scrim: "top" },
  { key: "holo", name: "Holo chrome", url: "https://d8j0ntlcm91z4.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/hf_20261030_101451_41788419-3fdf-436d-989a-5957b4c19344.png", textColor: "#fff", muted: "rgba(255,255,255,.75)", accent: "#fff", scrim: "full" },
  { key: "rocket", name: "Rocket", url: "https://d8j0ntlcm91z4.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/hf_20261030_101451_fec2a7ae-bc7f-49d1-a4b9-339490978401.png", textColor: "#fff", muted: "rgba(255,255,255,.7)", accent: "#4ade80", scrim: "top" },
  { key: "bar", name: "Gold bar", url: "https://d8j0ntlcm91z4.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/hf_20261030_101451_31e520f4-7a0f-4fe0-a03f-a863207d1249.png", textColor: "#fff", muted: "rgba(255,255,255,.72)", accent: "#ffd166", scrim: "top" },
];

/** Hero banner backgrounds (16:9). Served through the same /api/share-bg/:key proxy. */
export const HERO_BACKGROUNDS = [
  { key: "hero-bulls", name: "Bulls", url: "https://d8j0ntlcm91z4.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/hf_20261030_131122_b17468ee-8e1a-4dc5-bbd6-244ca0b1fb1d.png" },
  { key: "hero-chrome-gold", name: "Chrome & gold", url: "https://d8j0ntlcm91z4.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/hf_20261030_131432_e2398683-2558-4a7e-b591-332616ae2476.png" },
  { key: "hero-droplets", name: "Chrome droplets", url: "https://d8j0ntlcm91z4.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/hf_20261030_131432_c1325a0b-3c8b-4d1a-ae12-c3878c09c5aa.png" },
  { key: "hero-fightnight", name: "Fight night", url: "https://d8j0ntlcm91z4.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/hf_20261030_131121_3bf994e3-0ac8-4fd5-92b3-e218bd132082.png" },
  { key: "hero-chrome", name: "Liquid chrome", url: "https://d8j0ntlcm91z4.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/hf_20261030_131121_865ca019-fe8e-4e99-a79d-c6bb2155fb3f.png" },
];

/** Rank emblems (1:1, black background) and leaderboard medals / banner. Same proxy. */
export const ART = [
  { key: "rank-1", url: "https://d8j0ntlcm91z4.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/hf_20261030_174100_b34f5b2e-547a-40df-89e8-10fb9bcfed21.png" },
  { key: "rank-2", url: "https://d8j0ntlcm91z4.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/hf_20261030_174052_c749b817-137a-4861-8bc1-5e1b56468a49.png" },
  { key: "rank-3", url: "https://d8j0ntlcm91z4.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/hf_20261030_174054_20546eec-5edc-4852-9d4e-47c63674b0ef.png" },
  { key: "rank-4", url: "https://d8j0ntlcm91z4.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/hf_20261030_174059_2b2217df-ec21-4bb2-90a8-7fb341f59298.png" },
  { key: "rank-5", url: "https://d8j0ntlcm91z4.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/hf_20261030_174058_a4547118-8308-47bc-82d5-c0b2f3cbb2c9.png" },
  { key: "rank-6", url: "https://d8j0ntlcm91z4.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/hf_20261030_174056_8b44cd74-3cb8-4258-9e0b-bf85ecaad9e5.png" },
  { key: "rank-7", url: "https://d8j0ntlcm91z4.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/hf_20261030_174056_06ab6526-c811-4eb0-a131-ac40bb52575c.png" },
  { key: "rank-8", url: "https://d8j0ntlcm91z4.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/hf_20261030_174057_ce1660dc-1a86-4e8a-8a35-f740168c4976.png" },
  { key: "medal-1", url: "https://d8j0ntlcm91z4.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/hf_20261030_174100_afbab611-2b09-423a-b13b-c28322434d84.png" },
  { key: "medal-2", url: "https://d8j0ntlcm91z4.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/hf_20261030_174059_6379c01a-cf07-49c1-91d2-c9db5914f448.png" },
  { key: "medal-3", url: "https://d8j0ntlcm91z4.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/hf_20261030_174056_7aa61e38-f543-448e-a9e8-4cf2f09bb0af.png" },
  { key: "banner-mercury", url: "https://d8j0ntlcm91z4.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/hf_20261030_230412_579ac256-13e4-475b-8864-c973a964acc8.png" },
  { key: "logo-wordmark", url: "https://d2ol7oe51mr4n9.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/76176701-52d5-476e-b9c1-3c2c7559efcb.png" },
  { key: "icon-512", url: "https://d2ol7oe51mr4n9.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/acbd0ceb-4415-43ae-acbf-0e267257a989.png" },
  { key: "icon-180", url: "https://d2ol7oe51mr4n9.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/d573cc7e-11c9-42b7-95d6-06337b380044.png" },
  { key: "icon-32", url: "https://d2ol7oe51mr4n9.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/e849e2c7-9a82-41a4-b65b-c042537adbf0.png" },
  { key: "banner-candles", url: "https://d8j0ntlcm91z4.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/hf_20261030_225736_c2f162fa-be0a-4342-beca-f7e7a10b7698.png" },
  { key: "banner-chrome", url: "https://d8j0ntlcm91z4.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/hf_20261030_225735_29add364-3016-4279-9353-8faf2a4f65ee.png" },
  { key: "banner-arena", url: "https://d8j0ntlcm91z4.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/hf_20261030_225735_454b3b4c-8a55-49ae-955a-c953141bd8bc.png" },
  { key: "arena", url: "https://d8j0ntlcm91z4.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/hf_20261030_174059_b1ab2049-9324-4976-a4ae-37ce0915009b.png" },
];

/** Bot profile pictures (served as /api/share-bg/bot-<handle>). */
export const BOT_AVATARS = [
  { key: "bot-samui_sam", url: "https://d8j0ntlcm91z4.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/hf_20261030_184943_6b761c70-cbb9-430d-8227-6abcb0cadbb2_min.webp" },
  { key: "bot-degenmaxi", url: "https://d8j0ntlcm91z4.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/hf_20261030_184944_aa930803-9610-41b5-ae67-0d07afad3bd7_min.webp" },
  { key: "bot-fundingfarmer", url: "https://d8j0ntlcm91z4.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/hf_20261030_184943_0fcf59c0-51bd-4670-a90b-4d5b4b1fc420_min.webp" },
  { key: "bot-wickhunter", url: "https://d8j0ntlcm91z4.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/hf_20261030_184942_42c9b5fb-d95b-499c-8f0e-0233b3060a63_min.webp" },
  { key: "bot-contrarian_kate", url: "https://d8j0ntlcm91z4.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/hf_20261030_184942_4594247a-be86-4571-90b9-163f55093cb4_min.webp" },
  { key: "bot-bull_barry", url: "https://d2ol7oe51mr4n9.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/1d9df532-f0ad-4bac-abc9-6cd6d39a0baf.png" },
  { key: "bot-bear_bianca", url: "https://d2ol7oe51mr4n9.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/896a31e4-8004-4d7c-bb1b-b6962d1560e1.png" },
  { key: "bot-mooncat", url: "https://d8j0ntlcm91z4.cloudfront.net/user_3G3E1dWNGO7jgh3VdrYffCUeywr/hf_20261030_184942_096b37ee-54f5-4be4-8bde-706242548c1f_min.webp" },
];

/**
 * Perped's languages. Every piece of on-screen English goes through tt("…"); English is the key, so a missing
 * translation simply shows the English. The chosen language lives on the device (localStorage "perped:lang").
 * The server always renders English; on load, LangGate fetches the language file and re-renders once
 * (the page stays hidden for that moment so you never see English flash). Changing language reloads the app.
 */
export const LANGS = [
  { code: "en", name: "English" },
  { code: "es", name: "Español" },
  { code: "fr", name: "Français" },
  { code: "de", name: "Deutsch" },
  { code: "it", name: "Italiano" },
  { code: "ar", name: "العربية" },
  { code: "th", name: "ไทย" },
  { code: "zh", name: "简体中文" },
  { code: "ko", name: "한국어" },
  { code: "vi", name: "Tiếng Việt" },
] as const;
export type Lang = (typeof LANGS)[number]["code"];
export const LANG_KEY = "perped:lang";

let cur: Lang = "en";
let dict: Record<string, string> | null = null;

/** Translate one piece of on-screen text. Keeps the spaces around it, so text joined to numbers stays joined. */
export function tt(s: string): string {
  if (cur === "en" || !dict || !s) return s;
  const core = s.trim();
  const v = dict[core];
  if (!v) return s;
  return (/^\s/.test(s) ? " " : "") + v + (/\s$/.test(s) ? " " : "");
}

export function currentLang(): Lang { return cur; }

/** Languages written right to left. The whole layout mirrors for these. */
export const RTL: readonly string[] = ["ar"];

export function storedLang(): Lang {
  try {
    const l = localStorage.getItem(LANG_KEY);
    if (l && LANGS.some((x) => x.code === l)) return l as Lang;
  } catch {}
  return "en";
}

/** Loads a language file (each is its own small download) and makes it current. */
export async function loadLang(l: Lang): Promise<void> {
  if (l === "en") { cur = "en"; dict = null; return; }
  const loaders: Record<Exclude<Lang, "en">, () => Promise<{ default: Record<string, string> }>> = {
    th: () => import("./i18n/th.json"),
    zh: () => import("./i18n/zh.json"),
    ko: () => import("./i18n/ko.json"),
    es: () => import("./i18n/es.json"),
    vi: () => import("./i18n/vi.json"),
    fr: () => import("./i18n/fr.json"),
    de: () => import("./i18n/de.json"),
    it: () => import("./i18n/it.json"),
    ar: () => import("./i18n/ar.json"),
  };
  dict = (await loaders[l]()).default;
  cur = l;
}

/** Saves the choice and reloads so every screen picks it up. */
export function setLang(l: Lang) {
  try { localStorage.setItem(LANG_KEY, l); } catch {}
  window.location.reload();
}

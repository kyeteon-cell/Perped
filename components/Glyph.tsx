/**
 * Perped's own icon set: drawn for the app (24×24, rounded 1.9 strokes), used everywhere emojis used to be.
 * Inline SVG, inherits text colour; `tone` adds the brand finish (gold, blood, violet, chrome).
 */
export type GlyphName =
  | "swords" | "flame" | "glove" | "bolt" | "skull" | "drop" | "dagger" | "bag" | "crown" | "buoy"
  | "people" | "tomb" | "pin" | "bank" | "bell" | "megaphone" | "trophy" | "target";

const P: Record<GlyphName, React.ReactNode> = {
  swords: (<>
    <path d="M4 4l9.5 9.5M4 4h3.2l8.6 8.6M4 4v3.2l8.6 8.6" />
    <path d="M20 4l-9.5 9.5M20 4h-3.2l-3.6 3.6M20 4v3.2l-3.6 3.6" />
    <path d="M11.6 14.8l-2.4 2.4M7.4 15.6l3 3M6 19.8l2.1-2.1M14.8 12.4l2.4 2.4M13.6 16.6l3-3M18 17.9l2.1 2.1" />
  </>),
  flame: (<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.4 2.4-5.2 3.4-8.3.3 1.9 1.3 3 2.4 3.6C11 7 12.3 4.6 14.6 3c-.4 2.9.9 4.8 2.3 6.6 1 1.3 1.6 2.9 1.6 4.8C18.5 18.2 15.9 21 12 21z M12 21c-1.7 0-2.8-1.2-2.8-2.8 0-1.8 1.4-2.6 2-4.3.9 1 2.6 2 2.6 4.2 0 1.7-.9 2.9-1.8 2.9z" />),
  glove: (<>
    <path d="M7 11.5V8a5 5 0 0 1 5-5h1.5A4.5 4.5 0 0 1 18 7.5v4.2a5.3 5.3 0 0 1-2.2 4.3L15 16.6V20a1 1 0 0 1-1 1H8.5a1 1 0 0 1-1-1v-3.6A6 6 0 0 1 5 11.6 2 2 0 0 1 7 11.5z" />
    <path d="M7 11.5c1.6 0 2.8 1.1 2.8 2.6M10 8.5h5M7.5 17.5h7.5" />
  </>),
  bolt: (<path d="M13.2 2.8 5.5 13.4h5.6l-.9 7.8 7.8-10.7h-5.7l.9-7.7z" />),
  skull: (<>
    <path d="M12 3a7.5 7.5 0 0 0-7.5 7.5c0 2.6 1.3 4.3 2.8 5.3V19a1.5 1.5 0 0 0 1.5 1.5h6.4a1.5 1.5 0 0 0 1.5-1.5v-3.2c1.5-1 2.8-2.7 2.8-5.3A7.5 7.5 0 0 0 12 3z" />
    <circle cx="9" cy="11.2" r="1.7" fill="currentColor" stroke="none" /><circle cx="15" cy="11.2" r="1.7" fill="currentColor" stroke="none" />
    <path d="M12 14.2l-.9 1.6h1.8zM10.2 20.5v-2M13.8 20.5v-2" />
  </>),
  drop: (<path d="M12 3.2C9.4 7 6.4 10.3 6.4 14.1a5.6 5.6 0 0 0 11.2 0C17.6 10.3 14.6 7 12 3.2z M9.3 14.6a2.8 2.8 0 0 0 2.4 2.7" />),
  dagger: (<>
    <path d="M12 2.5l2 3v8.5h-4V5.5z" /><path d="M7.5 14h9M12 14v4.2M10.6 18.2h2.8l-.4 3.3h-2z" />
  </>),
  bag: (<>
    <path d="M9.2 3.5h5.6l-1.6 3.2h-2.4z" />
    <path d="M10.8 6.7C6.4 8.3 4.5 12 4.5 15c0 3.6 3 5.5 7.5 5.5s7.5-1.9 7.5-5.5c0-3-1.9-6.7-6.3-8.3" />
    <path d="M13.8 11.2c-.4-.7-1.1-1-1.9-1-1.2 0-2 .6-2 1.5 0 2.1 4.2 1.2 4.2 3.4 0 .9-.9 1.6-2.2 1.6-.9 0-1.7-.4-2.1-1.1M12 9.2v1M12 16.7v1" />
  </>),
  crown: (<path d="M3.5 8.5l4.2 3.6L12 5.5l4.3 6.6 4.2-3.6-1.7 9.5H5.2zM5.6 20.5h12.8" />),
  buoy: (<>
    <circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3.6" />
    <path d="M6 6l3.4 3.4M18 6l-3.4 3.4M6 18l3.4-3.4M18 18l-3.4-3.4" />
  </>),
  people: (<>
    <circle cx="9" cy="8.5" r="3.2" /><path d="M3.5 19.5c.4-3.1 2.6-5 5.5-5s5.1 1.9 5.5 5" />
    <path d="M15.2 5.6a3 3 0 0 1 0 5.8M17.4 14.7c1.8.5 2.9 2.2 3.1 4.8" />
  </>),
  tomb: (<>
    <path d="M6 20.5V10a6 6 0 0 1 12 0v10.5" /><path d="M3.5 20.5h17M12 8v6.5M9.6 10.4h4.8" />
  </>),
  pin: (<path d="M9 3.5h6l-1 5 3 3.2v1.3H7v-1.3l3-3.2zM12 13v7.5" />),
  bank: (<path d="M3.5 9.2 12 4l8.5 5.2zM5.5 9.5v8M9.8 9.5v8M14.2 9.5v8M18.5 9.5v8M3.5 20h17M4.5 17.5h15" />),
  bell: (<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.8H5zM10 20.5a2 2 0 0 0 4 0" />),
  megaphone: (<path d="M4 10v4a1 1 0 0 0 1 1h2l8 4.5V4.5L7 9H5a1 1 0 0 0-1 1zM7 15l1.2 4.5h2.3L9.6 15M18.5 9.5a3.5 3.5 0 0 1 0 5" />),
  trophy: (<path d="M7.5 4h9v5.2a4.5 4.5 0 0 1-9 0zM7.5 6H4.8v1.6A3 3 0 0 0 7.7 10.6M16.5 6h2.7v1.6a3 3 0 0 1-2.9 3M12 13.7v3.3M8.5 20.5h7M9.6 17h4.8l.6 3.5H9z" />),
  target: (<><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" fill="currentColor" /></>),
};

/** Filled shapes (read better small) vs line icons. */
const FILLED = new Set<GlyphName>(["bolt", "drop", "crown"]);

export function Glyph({ n, size, tone, className = "" }: { n: GlyphName; size?: number; tone?: "gold" | "blood" | "violet" | "chrome" | "muted"; className?: string }) {
  const filled = FILLED.has(n);
  return (
    <svg viewBox="0 0 24 24" className={`g ${tone ? `g-${tone}` : ""} ${className}`} width={size} height={size} aria-hidden="true"
      fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={filled ? 1.2 : 1.9} strokeLinecap="round" strokeLinejoin="round">
      {P[n]}
    </svg>
  );
}

/** Strip emoji from text that came from the database (old bot comments, old notifications). */
export const noEmoji = (s: string) => s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}]\u{FE0F}?\s?/gu, "").replace(/\s{2,}/g, " ").trim();

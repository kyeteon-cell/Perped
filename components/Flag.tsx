/**
 * Small hand-drawn flags for the language picker (inline SVG, no emoji). 3:2; corners are rounded in CSS (.flag),
 * which avoids clipPath ids clashing when the same flag shows twice on a page.
 * Arabic has no single country, so it uses a plain green field with a white sweep, the common stand-in.
 */
const star = (cx: number, cy: number, r: number, rot = -90) => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = ((rot + i * 36) * Math.PI) / 180, rr = i % 2 ? r * 0.4 : r;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
};

const BODIES: Record<string, React.ReactNode> = {
  en: <>
    <rect width="30" height="20" fill="#012169" />
    <path d="M0 0 30 20M30 0 0 20" stroke="#fff" strokeWidth="4" />
    <path d="M0 0 30 20M30 0 0 20" stroke="#C8102E" strokeWidth="1.4" />
    <path d="M15 0v20M0 10h30" stroke="#fff" strokeWidth="6" />
    <path d="M15 0v20M0 10h30" stroke="#C8102E" strokeWidth="3.4" />
  </>,
  es: <><rect width="30" height="20" fill="#AA151B" /><rect y="5" width="30" height="10" fill="#F1BF00" /></>,
  fr: <><rect width="10" height="20" fill="#002395" /><rect x="10" width="10" height="20" fill="#fff" /><rect x="20" width="10" height="20" fill="#ED2939" /></>,
  de: <><rect width="30" height="6.67" fill="#000" /><rect y="6.67" width="30" height="6.67" fill="#DD0000" /><rect y="13.33" width="30" height="6.67" fill="#FFCE00" /></>,
  it: <><rect width="10" height="20" fill="#009246" /><rect x="10" width="10" height="20" fill="#fff" /><rect x="20" width="10" height="20" fill="#CE2B37" /></>,
  ar: <><rect width="30" height="20" fill="#006C35" /><path d="M8 12.5c4 1.6 10 1.6 14 0" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" /><path d="M9 8.5h12" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" opacity=".85" /></>,
  th: <><rect width="30" height="20" fill="#A51931" /><rect y="3.33" width="30" height="13.34" fill="#F4F5F8" /><rect y="6.67" width="30" height="6.66" fill="#2D2A4A" /></>,
  zh: <><rect width="30" height="20" fill="#DE2910" /><polygon points={star(5, 5, 3)} fill="#FFDE00" /><polygon points={star(10, 2, 1, -60)} fill="#FFDE00" /><polygon points={star(12, 4, 1, -80)} fill="#FFDE00" /><polygon points={star(12, 7, 1, -100)} fill="#FFDE00" /><polygon points={star(10, 9, 1, -120)} fill="#FFDE00" /></>,
  ko: <>
    <rect width="30" height="20" fill="#fff" />
    <circle cx="15" cy="10" r="5" fill="#003478" />
    <path d="M10 10a5 5 0 0 1 10 0a2.5 2.5 0 0 1-5 0a2.5 2.5 0 0 0-5 0z" fill="#C60C30" />
    <g stroke="#000" strokeWidth="1.1"><path d="M4 4.5l3 -2M5 5.8l3 -2" /><path d="M22 2.5l3 2M23 3.8l3 2" /><path d="M4 15.5l3 2M5 14.2l3 2" /><path d="M22 17.5l3 -2M23 16.2l3 -2" /></g>
  </>,
  vi: <><rect width="30" height="20" fill="#DA251D" /><polygon points={star(15, 10, 6)} fill="#FFFF00" /></>,
};

export function Flag({ code, size = 20 }: { code: string; size?: number }) {
  const body = BODIES[code];
  if (!body) return null;
  return (
    <svg className="flag" width={size} height={(size * 2) / 3} viewBox="0 0 30 20" aria-hidden>
      {body}
    </svg>
  );
}

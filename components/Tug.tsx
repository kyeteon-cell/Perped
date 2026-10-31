/**
 * The battle tug bar: each half coloured by that trader's side (long green, short red), a soft shimmer running
 * across it, and a mercury bead sitting where the two meet that slides as the lead changes.
 */
export function Tug({ share, left, right, height = 6, className = "" }: { share: number; left: "long" | "short"; right: "long" | "short"; height?: number; className?: string }) {
  const s = Math.max(4, Math.min(96, share));
  return (
    <div className={`tug2 ${className}`} style={{ height }}>
      <i className={left} style={{ width: `${s}%` }} />
      <b className={right} />
      <em style={{ left: `${s}%` }} />
    </div>
  );
}

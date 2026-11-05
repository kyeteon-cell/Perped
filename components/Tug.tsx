/**
 * The battle tug bar: each half coloured by that trader's side (long green, short red), a soft shimmer running
 * across it, and a mercury bead sitting where the two meet that slides as the lead changes.
 */
/**
 * Where the bead sits for a gap in ROI points (left minus right). Scored on the gap itself, not as a share of the two
 * ROIs added together: two traders both up big used to sit dead centre even when one was clearly ahead.
 * 0 gap = 50%, ~2 pts ≈ 60%, ~5 pts ≈ 75%, 10+ pts pins near the end.
 */
export function tugShare(leftRoi: number, rightRoi: number, edge = 8) {
  const gap = (Number.isFinite(leftRoi) ? leftRoi : 0) - (Number.isFinite(rightRoi) ? rightRoi : 0);
  return Math.max(edge, Math.min(100 - edge, 50 + (50 - edge) * Math.tanh(gap / 5)));
}

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

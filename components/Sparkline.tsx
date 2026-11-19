export interface Point {
  t: number;
  v: number;
}

/** A 60 second trace. Plain SVG, no chart library. */
export function Sparkline({
  points,
  now,
  min,
  max,
  warn,
  windowMs = 60_000,
}: {
  points: Point[];
  now: number;
  min: number;
  max: number;
  warn?: number;
  windowMs?: number;
}) {
  const W = 300;
  const H = 40;
  const x = (t: number) => W - ((now - t) / windowMs) * W;
  const y = (v: number) => H - ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * (H - 2) - 1;

  const d = points
    .filter((p) => now - p.t <= windowMs)
    .map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`)
    .join("");

  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      {warn !== undefined && <line className="spark-warn" x1={0} x2={W} y1={y(warn)} y2={y(warn)} />}
      {d && <path className="spark-line" d={d} />}
    </svg>
  );
}

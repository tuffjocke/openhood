import type { Channel } from "@/core/profile";

export interface Point {
  t: number;
  v: number;
}

const W = 340;
const TOP = 10;
const BOTTOM = 90;
const WINDOW_MS = 30_000;
const GRID = Array.from({ length: 14 }, (_, i) => `M0 ${TOP + i * 6}L${W} ${TOP + i * 6}`).join("");
const TICKS = [1, 2, 3, 4, 5].map((k) => `M${Math.round((W * k) / 6)} 96L${Math.round((W * k) / 6)} 103`).join("");

/**
 * One reading as a card: its name (coloured by group) and unit, the value at the end of the row,
 * and the last 30 seconds as a line over fine grid lines. Anything past a limit is drawn in red.
 */
export function LiveChart({
  channel: c,
  points,
  now,
  value,
  unavailable,
}: {
  channel: Channel;
  points: Point[];
  now: number;
  value: number | undefined;
  unavailable?: boolean;
}) {
  const y = (v: number) => BOTTOM - ((Math.max(c.min, Math.min(c.max, v)) - c.min) / (c.max - c.min)) * (BOTTOM - TOP);
  const x = (t: number) => W - ((now - t) / WINDOW_MS) * W;
  const warn = (v: number) => (c.warnAbove !== undefined && v > c.warnAbove) || (c.warnBelow !== undefined && v < c.warnBelow);

  let line = "";
  let high = "";
  let inHigh = false;
  const recent = points.filter((p) => now - p.t <= WINDOW_MS);
  recent.forEach((p, i) => {
    const xy = `${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`;
    line += `${i ? "L" : "M"}${xy}`;
    const isHigh = warn(p.v);
    if (isHigh) high += `${inHigh ? "L" : "M"}${xy}`;
    inHigh = isHigh;
  });
  const zero = c.min < 0 && c.max > 0 ? `M0 ${y(0).toFixed(1)}L${W} ${y(0).toFixed(1)}` : "";
  const alarm = value !== undefined && !unavailable && warn(value);
  const shown = unavailable ? "n/a" : value === undefined ? "-" : fmt(value, c.decimals);

  return (
    <div className={`chart${c.group ? ` group-${c.group}` : ""}${alarm ? " warn" : ""}${unavailable ? " na" : ""}`}>
      <div className="chart-head">
        <span className="chart-name">
          {c.label} <span className="chart-unit">{c.unit}</span>
        </span>
        <span className="chart-value">{shown}</span>
      </div>
      <svg viewBox="0 0 340 120" aria-hidden>
        <path className="chart-grid" d={GRID} />
        <path className="chart-axis" d={`M0 96L${W} 96${TICKS}`} />
        {zero && <path className="chart-axis" d={zero} />}
        {line && <path className="chart-line" d={line} />}
        {high && <path className="chart-line high" d={high} />}
        <text className="chart-time" x="0" y="118">
          0:30
        </text>
        <text className="chart-time" x={W} y="118" textAnchor="end">
          0:00
        </text>
      </svg>
    </div>
  );
}

function fmt(v: number, d: number) {
  const s = v.toFixed(d);
  return /^-0(\.0+)?$/.test(s) ? s.slice(1) : s;
}

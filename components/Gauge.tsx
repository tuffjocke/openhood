/**
 * A segmented bar gauge, like the digital dashboards of the 1980s and 90s.
 * Lit segments show where the value sits between the channel's min and max.
 * The warning zone is marked underneath; when the value is in it, the lit
 * segments turn road-sign yellow.
 */
export function Gauge({
  value,
  min,
  max,
  warnAbove,
  warnBelow,
  segments = 24,
}: {
  value: number | undefined;
  min: number;
  max: number;
  warnAbove?: number;
  warnBelow?: number;
  segments?: number;
}) {
  const frac = value === undefined ? 0 : Math.max(0, Math.min(1, (value - min) / (max - min)));
  const lit = Math.round(frac * segments);
  const alarm =
    value !== undefined && ((warnAbove !== undefined && value > warnAbove) || (warnBelow !== undefined && value < warnBelow));
  const segValue = (i: number) => min + ((i + 0.5) / segments) * (max - min);
  return (
    <div className="gauge" aria-hidden>
      {Array.from({ length: segments }, (_, i) => {
        const v = segValue(i);
        const zone = (warnAbove !== undefined && v > warnAbove) || (warnBelow !== undefined && v < warnBelow);
        return <i key={i} className={`${i < lit ? "on" : ""}${zone ? " zone" : ""}${alarm && i < lit ? " alarm" : ""}`} />;
      })}
    </div>
  );
}

import { useMemo } from "react";
import type { Channel } from "@/core/profile";

/**
 * A round instrument, like a classic car or aircraft gauge: a 270° scale with fine ticks and
 * numbers round the edge, a short needle that sweeps the ring and leaves the middle free, and
 * the value printed large in the middle. The big dial can carry a battery bar in its bottom gap.
 * The scale is drawn once per channel; only the needle, value and bar change while reading.
 */
export function Dial({
  channel: c,
  value,
  unavailable,
  big,
  battery,
}: {
  channel: Channel;
  value: number | undefined;
  unavailable?: boolean;
  big?: boolean;
  battery?: { channel: Channel; value: number | undefined };
}) {
  const scale = useMemo(() => drawScale(c, !!big), [c, big]);
  const shown = unavailable ? "n/a" : value === undefined ? "-" : fmt(value, c.decimals);
  const alarm = value !== undefined && !unavailable && inWarn(c, value);
  const needle = value === undefined || unavailable ? START : angleOf(c, value);

  return (
    <figure className={`dial${big ? " big" : ""}${alarm ? " warn" : ""}${unavailable ? " na" : ""}`}>
      <svg viewBox="0 0 200 200" aria-hidden>
        <circle className="dial-rim" cx="100" cy="100" r="99" />
        <circle className="dial-face" cx="100" cy="100" r="97" />
        <circle className="dial-centre" cx="100" cy="100" r="52" />
        {big && <path className="dial-fine" d={scale.fine} />}
        <path className="dial-zone" d={scale.zone} />
        <path className="dial-minor" d={scale.minor} />
        <path className="dial-mid" d={scale.mid} />
        <path className="dial-major" d={scale.major} />
        <path className="dial-zone-ticks" d={scale.zoneTicks} />
        {scale.numbers.map((n) => (
          <text key={n.x + n.t} className="dial-num" x={n.x} y={n.y} textAnchor="middle" dominantBaseline="central">
            {n.t}
          </text>
        ))}
        {battery && <BatteryBar {...battery} />}
        <g className="dial-needle" style={{ transform: `rotate(${needle}deg)` }}>
          <line x1="100" y1="46" x2="100" y2={big ? 8 : 11} />
        </g>
      </svg>
      <figcaption>
        <span className="dial-value">{shown}</span>
        <span className="dial-unit">{c.unit}</span>
        <span className="sr-only">{c.label}</span>
      </figcaption>
      {battery && (
        <span className={`dial-battery${battery.value !== undefined && inWarn(battery.channel, battery.value) ? " warn" : ""}`}>
          <svg viewBox="0 0 24 14" role="img" aria-label={battery.channel.label}>
            <rect x="1" y="3" width="22" height="10" rx="1.5" />
            <path d="M5 1v2M19 1v2M4.5 8h3M16.5 8h3M18 6.5v3" />
          </svg>
          {battery.value === undefined ? "-" : `${fmt(battery.value, battery.channel.decimals)} ${battery.channel.unit}`}
        </span>
      )}
    </figure>
  );
}

/** Battery voltage as a bar in the bottom gap of the scale, filling left to right. */
function BatteryBar({ channel: c, value }: { channel: Channel; value: number | undefined }) {
  const r = 85.5;
  const frac = value === undefined ? 0 : Math.max(0.02, Math.min(1, (value - c.min) / (c.max - c.min)));
  const arc = (from: number, to: number) => {
    const [x1, y1] = at(from, r);
    const [x2, y2] = at(to, r);
    return `M${f2(x1)} ${f2(y1)}A${r} ${r} 0 0 0 ${f2(x2)} ${f2(y2)}`;
  };
  const warn = value !== undefined && inWarn(c, value);
  return (
    <>
      <path className="battery-track" d={arc(214, 146)} />
      {value !== undefined && <path className={`battery-fill${warn ? " warn" : ""}`} d={arc(214, 214 - frac * 68)} />}
    </>
  );
}

const START = -135;
const SWEEP = 270;
const R = 88;

const f2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (v: number, d: number) => {
  const s = v.toFixed(d);
  return /^-0(\.0+)?$/.test(s) ? s.slice(1) : s;
};
const inWarn = (c: Channel, v: number) =>
  (c.warnAbove !== undefined && v > c.warnAbove) || (c.warnBelow !== undefined && v < c.warnBelow);
const angleOf = (c: Channel, v: number) => START + Math.max(0, Math.min(1, (v - c.min) / (c.max - c.min))) * SWEEP;
const at = (deg: number, r: number) => {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [100 + r * Math.cos(rad), 100 + r * Math.sin(rad)] as const;
};

/** 1, 2 or 5 times a power of ten: steps people expect on a gauge. */
function niceStep(raw: number) {
  const p = 10 ** Math.floor(Math.log10(raw));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/** Ticks every tenth of a numbered step, a longer one halfway, numbers where they fit. */
function drawScale(c: Channel, big: boolean) {
  const span = c.max - c.min;
  const major = niceStep(span / (big ? 8 : 7));
  const minor = major / 10;
  const labelEvery = span / major > 10 ? major * 2 : major;
  const on = (x: number, step: number) => Math.abs(x / step - Math.round(x / step)) < 1e-6;
  const seg = (deg: number, len: number) => {
    const [x1, y1] = at(deg, R);
    const [x2, y2] = at(deg, R - len);
    return `M${f2(x1)} ${f2(y1)}L${f2(x2)} ${f2(y2)}`;
  };
  let majorD = "";
  let midD = "";
  let minorD = "";
  let zoneTicks = "";
  const numbers: { x: number; y: number; t: string }[] = [];
  for (let k = Math.ceil(c.min / minor - 1e-9); k * minor <= c.max + 1e-9; k++) {
    const x = k * minor;
    const deg = angleOf(c, x);
    const isMajor = on(x, major);
    const isMid = !isMajor && on(x, major / 2);
    const d = seg(deg, isMajor ? 10 : isMid ? 7 : 4);
    if (inWarn(c, x)) zoneTicks += d;
    else if (isMajor) majorD += d;
    else if (isMid) midD += d;
    else minorD += d;
    if (isMajor && on(x, labelEvery)) {
      const [nx, ny] = at(deg, R - 20);
      numbers.push({ x: f2(nx), y: f2(ny), t: String(f2(c.max >= 2000 ? x / 1000 : x)) });
    }
  }
  let fine = "";
  if (big)
    for (let j = 0; j <= 135; j++) {
      const deg = START + j * 2;
      const [x1, y1] = at(deg, R + 5);
      const [x2, y2] = at(deg, R + 8);
      fine += `M${f2(x1)} ${f2(y1)}L${f2(x2)} ${f2(y2)}`;
    }
  const arc = (a1: number, a2: number) => {
    const [x1, y1] = at(a1, R - 1);
    const [x2, y2] = at(a2, R - 1);
    return `M${f2(x1)} ${f2(y1)}A${R - 1} ${R - 1} 0 ${a2 - a1 > 180 ? 1 : 0} 1 ${f2(x2)} ${f2(y2)}`;
  };
  let zone = "";
  if (c.warnAbove !== undefined && c.warnAbove < c.max) zone += arc(angleOf(c, c.warnAbove), START + SWEEP);
  if (c.warnBelow !== undefined && c.warnBelow > c.min) zone += arc(START, angleOf(c, c.warnBelow));
  return { major: majorD, mid: midD, minor: minorD, zoneTicks, zone, fine, numbers };
}

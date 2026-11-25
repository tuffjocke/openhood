/**
 * Drawings for the steps page, in the page's own colours (they follow dark mode by themselves):
 * the cable or adapter to get, and where it plugs in with the key turned to II.
 */

/** The car end of every cable and adapter: the 16-pin OBD plug, seen from the front. */
function ObdFace({ x, y, w = 90, fill = "var(--ink)" }: { x: number; y: number; w?: number; fill?: string }) {
  const h = w * 0.36;
  const inset = w * 0.08;
  const pins = (n: number, from: number, to: number, py: number) =>
    Array.from({ length: n }, (_, i) => <circle key={`${py}-${i}`} cx={from + ((to - from) * i) / (n - 1)} cy={py} r={w * 0.02} fill="var(--paper)" />);
  return (
    <g>
      <path d={`M${x} ${y} H${x + w} L${x + w - inset} ${y + h} H${x + inset} Z`} fill={fill} strokeLinejoin="round" stroke={fill} strokeWidth="4" />
      {pins(8, x + w * 0.13, x + w * 0.87, y + h * 0.32)}
      {pins(8, x + w * 0.19, x + w * 0.81, y + h * 0.72)}
    </g>
  );
}

/** A USB-A plug, pointing right. */
function UsbPlug({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x} y={y} width="38" height="26" rx="5" fill="var(--ink)" />
      <rect x={x + 36} y={y + 3} width="24" height="20" rx="2" fill="var(--surface-2)" stroke="var(--ink)" strokeWidth="3" />
      <rect x={x + 44} y={y + 9} width="5" height="4" fill="var(--ink)" />
      <rect x={x + 52} y={y + 9} width="5" height="4" fill="var(--ink)" />
    </g>
  );
}

/** What to get: a KKL cable (OBD plug, lead, USB), or an ELM327 adapter (USB, Bluetooth, or not known yet). */
export function CableArt({ kind, link }: { kind: "kkl" | "elm327"; link?: "usb" | "bluetooth" }) {
  if (kind === "kkl")
    return (
      <svg className="step-art" viewBox="0 0 360 130" role="img" aria-label="KKL cable: car plug, lead, USB plug">
        <ObdFace x={24} y={30} w={104} />
        <path d="M76 72 C76 124 170 120 210 88 S 268 52 292 63" fill="none" stroke="var(--ink)" strokeWidth="6" strokeLinecap="round" />
        <UsbPlug x={286} y={50} />
      </svg>
    );
  const usb = link === "usb";
  const ble = link === "bluetooth";
  return (
    <svg className="step-art" viewBox="0 0 360 130" role="img" aria-label="ELM327 adapter">
      <g transform={usb ? "translate(-46 0)" : ble ? "translate(-20 0)" : ""}>
        {/* Side view: the plug goes into the car, the box sits behind it. */}
        <path d="M112 44 L140 40 V90 L112 86 Z" fill="var(--ink-soft)" stroke="var(--ink-soft)" strokeWidth="4" strokeLinejoin="round" />
        <rect x="138" y="26" width="112" height="78" rx="16" fill="var(--ink)" />
        <text x="194" y="72" textAnchor="middle" fontFamily="var(--num)" fontSize="22" fontWeight="600" fill="var(--paper)">
          ELM327
        </text>
        <circle cx="232" cy="42" r="4" fill="var(--ok)" />
        {ble && (
          <g fill="none" stroke="var(--air)" strokeWidth="5" strokeLinecap="round">
            <path d="M268 50 a 20 20 0 0 1 0 30" />
            <path d="M282 38 a 36 36 0 0 1 0 54" />
          </g>
        )}
        {usb && (
          <>
            <path d="M250 65 C282 65 286 92 316 92 S 340 70 342 70" fill="none" stroke="var(--ink)" strokeWidth="6" strokeLinecap="round" />
          </>
        )}
      </g>
      {usb && <UsbPlug x={292} y={57} />}
    </svg>
  );
}

/** Ignition positions from off to crank, clockwise from the top. II is where the car wakes up. */
const POSITIONS: [string, number][] = [
  ["0", -60],
  ["I", -20],
  ["II", 20],
  ["III", 60],
];

/** Plug it into the socket under the dash, then turn the key to II. */
export function PlugInArt() {
  const cx = 262;
  const cy = 86;
  const at = (deg: number, r: number) => [cx + r * Math.sin((deg * Math.PI) / 180), cy - r * Math.cos((deg * Math.PI) / 180)];
  return (
    <svg className="step-art" viewBox="0 0 360 160" role="img" aria-label="Plug into the socket, key to position II">
      {/* The socket in the dash, the plug going up into it. */}
      <rect x="14" y="10" width="140" height="22" rx="6" fill="var(--surface-2)" />
      <ObdFace x={38} y={32} w={92} fill="var(--ink-soft)" />
      <path d="M84 94 V70 M74 80 L84 70 L94 80" fill="none" stroke="var(--needle)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <ObdFace x={38} y={102} w={92} />
      <path d="M84 135 V156" stroke="var(--ink)" strokeWidth="6" strokeLinecap="round" />

      {/* The ignition, turned to II. */}
      <circle cx={cx} cy={cy} r="50" fill="var(--surface-2)" />
      {POSITIONS.map(([label, deg]) => {
        const [x, y] = at(deg, 68);
        const lit = label === "II";
        return (
          <g key={label}>
            {lit && <circle cx={x} cy={y} r="15" fill="var(--sign)" />}
            <text
              x={x}
              y={y + 6}
              textAnchor="middle"
              fontFamily="var(--num)"
              fontSize="18"
              fontWeight="600"
              fill={lit ? "var(--sign-ink)" : "var(--muted)"}
            >
              {label}
            </text>
          </g>
        );
      })}
      <g transform={`rotate(20 ${cx} ${cy})`}>
        <rect x={cx - 12} y={cy - 46} width="24" height="92" rx="12" fill="var(--ink)" />
        <circle cx={cx} cy={cy - 34} r="4.5" fill="var(--needle)" />
      </g>
    </svg>
  );
}

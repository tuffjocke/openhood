import Link from "next/link";

// The standard 16-pin diagnostic socket (SAE J1962), as you see it when facing it.
// Top row pins 1 to 8, bottom row 9 to 16. Data is on pin 7 (K-line, older cars) or on
// pins 6 and 14 (CAN, newer cars). 16 is battery power for the adapter, 4 and 5 are ground.
const TOP = Array.from({ length: 8 }, (_, i) => ({ n: i + 1, x: 82 + i * 45 }));
const BOTTOM = Array.from({ length: 8 }, (_, i) => ({ n: i + 9, x: 100 + i * 40 }));
const role = (n: number) =>
  n === 7 ? "data" : n === 6 || n === 14 ? "can" : n === 16 ? "power" : n === 4 || n === 5 ? "ground" : "";

function Connector() {
  return (
    <svg className="connector" viewBox="0 0 480 250" role="img" aria-label="The 16-pin socket. Data is on pin 7 on older cars, and on pins 6 and 14 on newer cars.">
      <path className="shell" d="M40 46 Q42 28 60 28 H420 Q438 28 440 46 L418 206 Q415 222 398 222 H82 Q65 222 62 206 Z" />
      <path className="face" d="M62 56 Q63 46 74 46 H406 Q417 46 418 56 L400 192 Q398 204 386 204 H94 Q82 204 80 192 Z" />
      {TOP.map((p) => (
        <g key={p.n}>
          <rect className={`cavity ${role(p.n)}`} x={p.x - 8} y={86} width={16} height={26} rx={4} />
          <text className="pin-no" x={p.x} y={74}>{p.n}</text>
        </g>
      ))}
      {BOTTOM.map((p) => (
        <g key={p.n}>
          <rect className={`cavity ${role(p.n)}`} x={p.x - 8} y={138} width={16} height={26} rx={4} />
          <text className="pin-no" x={p.x} y={186}>{p.n}</text>
        </g>
      ))}
    </svg>
  );
}

/** Where the diagnostic socket is, what it looks like, and which cable to buy. */
export function SocketGuide() {
  return (
    <section className="band" id="socket" aria-labelledby="socket-title">
      <div className="band-text">
        <h2 id="socket-title">Find the socket</h2>
        <p>Under the dashboard, driver&rsquo;s side, near your knee.</p>
        <Link className="text-button" href="/adapters">
          Which adapter to buy
        </Link>
      </div>
      <figure className="panel">
        <Connector />
        <dl className="pin-legend">
          <div>
            <dt><i className="swatch data" />Pin 7</dt>
            <dd>Data, older cars</dd>
          </div>
          <div>
            <dt><i className="swatch can" />Pins 6 and 14</dt>
            <dd>Data, newer cars</dd>
          </div>
          <div>
            <dt><i className="swatch power" />Pin 16</dt>
            <dd>Power</dd>
          </div>
          <div>
            <dt><i className="swatch ground" />Pins 4 and 5</dt>
            <dd>Ground</dd>
          </div>
        </dl>
      </figure>
    </section>
  );
}

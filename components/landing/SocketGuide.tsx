const CABLE_URL = "https://github.com/tuffjocke/openhood/blob/main/docs/hardware.md";

// The standard 16-pin diagnostic socket (SAE J1962), as you see it when facing it.
// Top row pins 1 to 8, bottom row 9 to 16. Pin 7 carries the data Openhood reads,
// 16 is battery power for the cable, 4 and 5 are ground.
const TOP = Array.from({ length: 8 }, (_, i) => ({ n: i + 1, x: 82 + i * 45 }));
const BOTTOM = Array.from({ length: 8 }, (_, i) => ({ n: i + 9, x: 100 + i * 40 }));
const role = (n: number) => (n === 7 ? "data" : n === 16 ? "power" : n === 4 || n === 5 ? "ground" : "");

function Connector() {
  return (
    <svg className="connector" viewBox="0 0 480 250" role="img" aria-label="The 16-pin socket. Pin 7, top row, seventh from the left, is the one Openhood needs.">
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
        <p>
          Every car since the late 1990s has the same 16-pin socket. Look under the dashboard on the driver&rsquo;s side,
          near your knee. On some cars it hides behind a small cover or in the centre console.
        </p>
        <h3>What to plug in</h3>
        <p>
          Pick your car above and Openhood tells you. Most cars need an ELM327-type adapter, USB or Bluetooth, about €20
          to €40. Some cars with their own profile need a KKL cable instead.
        </p>
        <a className="text-button" href={CABLE_URL}>
          What to buy, and what to avoid
        </a>
      </div>
      <figure className="panel">
        <Connector />
        <dl className="pin-legend">
          <div>
            <dt><i className="swatch data" />Pin 7</dt>
            <dd>Data. If there&rsquo;s metal here, Openhood can talk to your car.</dd>
          </div>
          <div>
            <dt><i className="swatch power" />Pin 16</dt>
            <dd>Battery power for the cable.</dd>
          </div>
          <div>
            <dt><i className="swatch ground" />Pins 4 and 5</dt>
            <dd>Ground.</dd>
          </div>
        </dl>
        <figcaption>The socket as you see it when you face it.</figcaption>
      </figure>
    </section>
  );
}

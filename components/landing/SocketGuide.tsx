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
    <section className="socket" id="socket" aria-labelledby="socket-title">
      <figure className="socket-art">
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
      <div className="socket-text">
        <h2 id="socket-title">Find the socket</h2>
        <p>
          Every car since the late 1990s has the same 16-pin diagnostic socket. It&rsquo;s a wide, rounded trapezoid,
          about the size of a matchbox.
        </p>
        <h3>Where to look</h3>
        <ol className="look">
          <li>Under the dashboard on the driver&rsquo;s side, near your knee. Most cars have it here.</li>
          <li>Behind a small cover, often in the fuse box lid.</li>
          <li>In the centre console, near the gear lever.</li>
        </ol>
        <h3>The cable</h3>
        <p>
          A USB diagnostic cable sold as <strong>KKL 409.1</strong> with an <strong>FTDI</strong> chip, about €20 online.
          For a USB-C laptop or phone, add a small USB-A to USB-C adapter.
        </p>
        <a className="text-button" href={CABLE_URL}>
          What to buy, and what to avoid
        </a>
      </div>
    </section>
  );
}

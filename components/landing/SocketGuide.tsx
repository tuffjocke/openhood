const CABLE_URL = "https://github.com/tuffjocke/openhood/blob/main/docs/hardware.md";

/** Where the diagnostic socket is, what it looks like, and which cable to buy. */
export function SocketGuide() {
  return (
    <section className="socket" aria-labelledby="socket-title">
      <div className="socket-art" aria-hidden>
        {/* The driver's view: steering wheel, dashboard edge, pedals, and the socket under the dash. */}
        <svg viewBox="0 0 360 240" className="socket-scene">
          <path className="dash" d="M0 70 C80 48 280 48 360 70 L360 96 C280 82 80 82 0 96 Z" />
          <circle className="wheel" cx="210" cy="92" r="58" />
          <circle className="hub" cx="210" cy="92" r="14" />
          <path className="column" d="M196 150 L192 196 L228 196 L224 150" />
          <rect className="pedal" x="178" y="206" width="14" height="22" rx="3" />
          <rect className="pedal" x="210" y="206" width="14" height="22" rx="3" />
          <rect className="pedal" x="242" y="206" width="22" height="22" rx="3" />
          <g className="hit">
            <circle cx="118" cy="128" r="26" />
            <rect x="104" y="120" width="28" height="16" rx="4" />
          </g>
        </svg>
        <svg viewBox="0 0 200 92" className="socket-pins">
          <path className="shell" d="M14 8 H186 L172 84 H28 Z" />
          {Array.from({ length: 8 }, (_, i) => (
            <circle key={`a${i}`} className={i === 6 ? "pin k" : "pin"} cx={38 + i * 18} cy={32} r="5.5" />
          ))}
          {Array.from({ length: 8 }, (_, i) => (
            <circle key={`b${i}`} className="pin" cx={47 + i * 15.5} cy={62} r="5.5" />
          ))}
        </svg>
      </div>
      <div className="socket-text">
        <h2 id="socket-title">Find the socket</h2>
        <p>
          Every car since the late 1990s has a diagnostic socket, usually under the dashboard on the driver&rsquo;s side,
          near your knee. Sometimes it hides behind a small flap.
        </p>
        <p>
          It&rsquo;s a 16-pin socket shaped like a wide trapezoid. Look at the top row: a metal pin in the seventh
          position means your car can talk to Openhood.
        </p>
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

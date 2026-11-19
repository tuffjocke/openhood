/** The engine warning lamp (the familiar engine outline), drawn for Openhood. */
export function EngineLight({ lit }: { lit: boolean }) {
  return (
    <svg className={`engine-light${lit ? " lit" : ""}`} viewBox="0 0 64 44" aria-hidden>
      <path
        d="M14 10h12V6h-6V2h18v4h-6v4h10l6 6h4v-4h6v20h-6v-4h-4v6l-6 6H20l-6-6H8v6H2V14h6v6h6z"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

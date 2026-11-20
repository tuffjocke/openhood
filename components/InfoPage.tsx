import Link from "next/link";
import type { ReactNode } from "react";

/** A plain reading page (adapters, disclaimer) with the same header and footer as the app. */
export function InfoPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="shell info">
      <header className="top">
        <div className="mark">
          <Link className="mark-name" href="/">
            Openhood
          </Link>
        </div>
      </header>
      <article className="prose">
        <h1>{title}</h1>
        {children}
        <p className="prose-back">
          <Link className="text-button" href="/">
            Back to reading your car
          </Link>
        </p>
      </article>
    </main>
  );
}

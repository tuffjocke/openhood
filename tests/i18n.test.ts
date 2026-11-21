/**
 * Every text the components pass to t() has a Swedish version, and the Swedish follows the
 * writing rules (no em or en dashes).
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { translator } from "@/core/i18n";
import { SV } from "@/core/i18n/sv";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".tsx") ? [p] : [];
  });
}

/** The quoted strings in the first argument of each t( ... ) call. */
function keys(src: string): string[] {
  const out: string[] = [];
  const re = /(?<![\w.])t\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let depth = 1;
    let j = m.index + m[0].length;
    const start = j;
    while (depth && j < src.length) {
      if (src[j] === "(") depth++;
      else if (src[j] === ")") depth--;
      j++;
    }
    const first = src.slice(start, j - 1).split(", {")[0];
    for (const q of first.matchAll(/"((?:[^"\\]|\\.)*)"/g)) out.push(JSON.parse(`"${q[1]}"`));
  }
  return out;
}

// Strings inside t() that are comparisons or arguments, not text to show.
const NOT_TEXT = new Set(["ELM", "a", "an", "copied", "simulator", "usb", "yes"]);

describe("Swedish", () => {
  it("has every text the components show", () => {
    const missing = new Set<string>();
    for (const f of files("components")) for (const k of keys(readFileSync(f, "utf8"))) if (!NOT_TEXT.has(k) && !(k in SV)) missing.add(k);
    assert.deepEqual([...missing], []);
  });

  it("uses no em or en dashes", () => {
    for (const [en, sv] of Object.entries(SV)) assert.ok(!/[–—]/.test(sv), en);
  });

  it("fills in values and falls back to English", () => {
    const t = translator("sv");
    assert.equal(t("Got the {thing}", { thing: "KKL-kabel" }), "Du har en KKL-kabel");
    assert.equal(t("Not in the table"), "Not in the table");
  });
});

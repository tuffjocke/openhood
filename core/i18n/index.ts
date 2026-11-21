/**
 * The site in more than one language, without a library. English text is the key: `t("Read my car")`
 * looks it up in the language's table and falls back to the English. Text with a value in it uses
 * {name} holes: `t("Got the {thing}", { thing })`.
 *
 * Writing rules (AGENTS.md) hold in every language: plain words, few of them, no em or en dashes.
 */
import { SV } from "./sv";

export type Lang = "en" | "sv";
export const LANGS: Lang[] = ["en", "sv"];
export const LANG_NAMES: Record<Lang, string> = { en: "English", sv: "Svenska" };

const TABLES: Record<Lang, Record<string, string>> = { en: {}, sv: SV };

export type T = (text: string, vars?: Record<string, string | number>) => string;

export function translator(lang: Lang): T {
  const table = TABLES[lang];
  return (text, vars) => {
    let out = table[text] ?? text;
    if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
    return out;
  };
}

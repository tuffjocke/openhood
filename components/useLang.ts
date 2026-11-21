"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LANGS, translator, type Lang, type T } from "@/core/i18n";
import type { VehicleProfile } from "@/core/profile";

const KEY = "openhood.lang";
const EVENT = "openhood-lang";

/** The page's language: the person's choice, else Swedish for a Swedish browser, else English. */
export function useLang(): [Lang, (l: Lang) => void] {
  const [lang, setState] = useState<Lang>("en");
  useEffect(() => {
    const read = () => {
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(KEY);
      } catch {}
      const l = LANGS.includes(saved as Lang) ? (saved as Lang) : navigator.language.toLowerCase().startsWith("sv") ? "sv" : "en";
      setState(l);
      document.documentElement.lang = l;
    };
    read();
    window.addEventListener(EVENT, read);
    return () => window.removeEventListener(EVENT, read);
  }, []);
  const set = useCallback((l: Lang) => {
    try {
      localStorage.setItem(KEY, l);
    } catch {}
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [lang, set];
}

/** `t("Read my car")` in the page's language. English text is the key, so untranslated text stays English. */
export function useT() {
  const [lang] = useLang();
  return useMemo(() => translator(lang), [lang]);
}

/** A profile with its channel labels in the page's language (profiles name them in English). */
export function labelsIn(p: VehicleProfile, t: T): VehicleProfile {
  return { ...p, channels: p.channels.map((c) => ({ ...c, label: t(c.label) })) };
}

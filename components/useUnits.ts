"use client";

import { useCallback, useEffect, useState } from "react";
import { unitsFor, UNITS, type Units } from "@/core/units";

const KEY = "openhood.units";
const EVENT = "openhood-units";

/** The units to show readings in: the person's choice, else a guess from the browser's region. Shared across the page. */
export function useUnits(): [Units, (u: Units) => void] {
  const [units, setState] = useState<Units>("metric");
  useEffect(() => {
    const read = () => {
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(KEY);
      } catch {}
      setState(UNITS.includes(saved as Units) ? (saved as Units) : unitsFor(navigator.language));
    };
    read();
    window.addEventListener(EVENT, read);
    return () => window.removeEventListener(EVENT, read);
  }, []);
  const set = useCallback((u: Units) => {
    try {
      localStorage.setItem(KEY, u);
    } catch {}
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [units, set];
}

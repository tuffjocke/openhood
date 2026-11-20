"use client";

import { useEffect, useRef, useState } from "react";
import type { VehicleProfile } from "@/core/profile";
import { CarChooser } from "./CarChooser";

export interface Selection {
  profileId: string;
  make?: string;
  model?: string;
  year?: number;
  engine?: string;
  /** False until the person has picked a car themselves (first visit). */
  chosen?: boolean;
}

export function selectionLabel(sel: Selection, profile: VehicleProfile) {
  if (sel.make && sel.model && sel.year) return { title: `${sel.make} ${sel.model} ${sel.year}`, detail: sel.engine };
  return { title: profile.generic ? "Any car" : profile.name, detail: profile.generic ? "standard codes" : undefined };
}

/** The car in the header: a pill that opens the same chooser as the landing page. */
export function VehiclePicker({
  profiles,
  selection,
  profile,
  disabled,
  onSelect,
}: {
  profiles: VehicleProfile[];
  selection: Selection;
  profile: VehicleProfile;
  disabled: boolean;
  onSelect: (s: Selection) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // Close on outside click and Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = selectionLabel(selection, profile);

  return (
    <div className="vp" ref={root}>
      <button
        className={`vp-button${selection.chosen ? "" : " vp-unset"}`}
        onClick={() => setOpen(!open)}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={selection.chosen ? `Your car: ${label.title}. Change` : "Choose your car"}
      >
        {!selection.chosen && <i className="vp-dot" aria-hidden />}
        <span className="vp-title">
          {selection.chosen ? label.title : "Choose your car"}
          {selection.chosen && label.detail && <span className="vp-detail">{label.detail}</span>}
        </span>
        {!disabled && <span className="vp-chevron" aria-hidden />}
      </button>

      {open && (
        <div className="vp-panel" role="dialog" aria-label="Choose your car">
          <p className="vp-head">Which car is it?</p>
          <CarChooser
            profiles={profiles}
            selection={selection}
            onSelect={onSelect}
            autoFocus
            actions={() => (
              <div className="chooser-actions">
                <button onClick={() => setOpen(false)}>Done</button>
              </div>
            )}
          />
        </div>
      )}
    </div>
  );
}

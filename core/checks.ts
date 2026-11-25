/**
 * Test checks: short, read-only steps that tell more about a car than a fault read alone (issue #25).
 * Each check says what the person does, which readings to watch and for how long, and how to judge
 * them. Nothing here writes to the car: a check only reads faults and live values.
 *
 * Profiles list their checks in `VehicleProfile.checks`, usually `standardChecks(...)` with their
 * own channel keys plus checks of their own. The limits below are general workshop rules of thumb,
 * not one maker's figures, and every verdict is worded as "worth a look", never as a diagnosis.
 * docs/testing-a-car.md has the steps for people.
 */
import type { Channel, Fault } from "./profile";

export type Verdict = "ok" | "look" | "unclear";

export interface Finding {
  verdict: Verdict;
  /** One plain sentence: what was seen and, for "look", what to check. */
  text: string;
}

/** What a check read: each watched channel's values in order (one per read cycle), and faults. */
export interface CheckReading {
  series: Record<string, number[]>;
  /** With `faults`: the faults read before and after the readings. */
  faultsBefore?: Fault[];
  faultsAfter?: Fault[];
}

export interface CarCheck {
  id: string;
  title: string;
  /** What the person does, in plain words, said to them before the check starts. */
  ask: string;
  /** The engine runs during this check: say the safety note first. */
  engineRunning?: boolean;
  /** How long to read live values. 0: no live reading (faults only). At most 120. */
  seconds: number;
  /** Channel keys to read. Unknown or unsupported ones are skipped. */
  watch: string[];
  /** Read the faults before (and, with seconds, after) the readings. */
  faults?: boolean;
  /**
   * A pacer the live view shows while the check runs, so the person knows what to do when: every
   * `period` seconds, `up` (take `channel` to about `high`) for the first half, then `down` (back to
   * `low`). The rev test: rev to 2,500 rpm, let it drop, four times.
   */
  guide?: { channel: string; low: number; high: number; period: number; up: string; down: string };
  judge(r: CheckReading): Finding[];
}

/** Where a check's pacer is `seconds` into the check: the target, and whether it's the "up" half. */
export function guideAt(g: NonNullable<CarCheck["guide"]>, seconds: number) {
  const phase = (seconds % g.period) / g.period;
  const up = phase < 0.5;
  return { up, target: up ? g.high : g.low, text: up ? g.up : g.down, next: g.period * (up ? 0.5 : 1) - (seconds % g.period) };
}

/** Said before any check with the engine running. */
export const ENGINE_SAFETY =
  "Parked outdoors or with a door open, handbrake on, in neutral (or P). Keep hands, hair and cables clear of the fan and belts, and nobody in front of the car.";

// ---- small helpers ----------------------------------------------------------------------------

const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const sorted = (v: number[]) => [...v].sort((a, b) => a - b);
/** The value below which `p` (0 to 1) of the values lie. */
const pct = (v: number[], p: number) => {
  const s = sorted(v);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
};
const r0 = (x: number) => Math.round(x);
const r1 = (x: number) => Math.round(x * 10) / 10;

/** Pearson correlation of two series of the same length, or null if one doesn't vary. */
export function correlation(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 3) return null;
  const ma = mean(a.slice(0, n));
  const mb = mean(b.slice(0, n));
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < n; i++) {
    sab += (a[i] - ma) * (b[i] - mb);
    saa += (a[i] - ma) ** 2;
    sbb += (b[i] - mb) ** 2;
  }
  return saa && sbb ? sab / Math.sqrt(saa * sbb) : null;
}

const has = (r: CheckReading, key?: string): key is string => !!key && (r.series[key]?.length ?? 0) > 0;
const notRead = (what: string): Finding => ({ verdict: "unclear", text: `${what} didn't answer, so this couldn't be checked.` });
const faultText = (f: Fault) => [f.code, f.name, f.state && `(${f.state})`].filter(Boolean).join(" ");

// ---- the standard checks ----------------------------------------------------------------------

/** Channel keys a profile uses for what the standard checks look at. Leave out what it doesn't have. */
export interface CheckChannels {
  rpm?: string;
  /** Battery or module voltage. */
  battery?: string;
  coolant?: string;
  /** Temperature sensors that should agree on a cold engine (coolant included). */
  temperatures?: string[];
  /** Readings that should rise and fall with the revs: air flow, manifold pressure, throttle. */
  followRevs?: string[];
  /** Fuel trims in % (OBD-II): together near 0 on a healthy engine. */
  trims?: string[];
}

/**
 * The checks from issue #25 that work on any engine: faults, ignition on, idle, a rev test,
 * charging under load, a wiggle test and warm-up. Each uses only the channels given.
 */
export function standardChecks(channels: Channel[], c: CheckChannels): CarCheck[] {
  const label = (k: string) => channels.find((ch) => ch.key === k)?.label ?? k;
  const checks: CarCheck[] = [
    {
      id: "faults",
      title: "Faults",
      ask: "Ignition on (key to II), engine off. Nothing else to do.",
      seconds: 0,
      watch: [],
      faults: true,
      judge: (r) => {
        const f = r.faultsBefore ?? [];
        return f.length
          ? [{ verdict: "look", text: `${f.length} stored: ${f.map(faultText).join("; ")}. Explain each one before going on; some are normal on some cars.` }]
          : [{ verdict: "ok", text: "No faults stored." }];
      },
    },
  ];

  const keyOn = [c.battery, ...(c.temperatures ?? [])].filter((k): k is string => !!k);
  if (keyOn.length)
    checks.push({
      id: "ignition",
      title: "Ignition on, engine off",
      ask: "Ignition on, engine off, best after the car has stood for a few hours. Nothing to do for 10 seconds.",
      seconds: 10,
      watch: [...keyOn, ...(c.rpm ? [c.rpm] : [])],
      judge: (r) => {
        if (has(r, c.rpm) && mean(r.series[c.rpm]) > 300) return [{ verdict: "unclear", text: "The engine is running: switch it off, leave the ignition on and run this again." }];
        const out: Finding[] = [];
        if (c.battery) {
          if (!has(r, c.battery)) out.push(notRead(label(c.battery)));
          else {
            // With the ignition on the pumps and relays draw current, and the ECU reads a little under
            // the battery's own terminals, so these limits sit below a resting battery's 12.6 V.
            const v = mean(r.series[c.battery]);
            out.push(
              v >= 12.2
                ? { verdict: "ok", text: `Battery ${r1(v)} V with the ignition on: fine.` }
                : { verdict: "look", text: `Battery ${r1(v)} V with the ignition on: low. Charge it, then have it tested if it drops again; a weak battery sets odd faults of its own.` },
            );
          }
        }
        const temps = (c.temperatures ?? []).filter((k) => has(r, k));
        if (temps.length >= 2) {
          const now = temps.map((k) => ({ k, v: mean(r.series[k]) }));
          const coolant = c.coolant && has(r, c.coolant) ? mean(r.series[c.coolant]) : Math.min(...now.map((t) => t.v));
          const mid = pct(now.map((t) => t.v), 0.5);
          const worst = now.reduce((a, b) => (Math.abs(b.v - mid) > Math.abs(a.v - mid) ? b : a));
          const spread = Math.max(...now.map((t) => t.v)) - Math.min(...now.map((t) => t.v));
          const list = now.map((t) => `${label(t.k)} ${r0(t.v)} °C`).join(", ");
          if (coolant > 35) out.push({ verdict: "unclear", text: `The engine is warm (${list}), so the sensors can't be compared. Run this again after the car has stood for a few hours.` });
          else if (spread <= 6) out.push({ verdict: "ok", text: `Temperature sensors agree on a cold engine: ${list}.` });
          else out.push({ verdict: "look", text: `On a cold engine ${label(worst.k)} reads ${r0(worst.v)} °C against the others' ${r0(mid)} °C (${list}). Check that sensor and its plug.` });
        }
        return out;
      },
    });

  if (c.rpm) {
    const rpm = c.rpm;
    checks.push({
      id: "idle",
      title: "Idle",
      ask: "Start the engine and let it idle. Hands off the pedals for 30 seconds.",
      engineRunning: true,
      seconds: 30,
      watch: [rpm, ...(c.trims ?? []), ...(c.coolant ? [c.coolant] : [])],
      judge: (r) => {
        if (!has(r, rpm)) return [notRead(label(rpm))];
        const v = r.series[rpm];
        if (mean(v) < 300) return [{ verdict: "unclear", text: "The engine isn't running. Start it and run this again." }];
        const lo = pct(v, 0.05);
        const hi = pct(v, 0.95);
        const out: Finding[] = [
          hi - lo <= 100
            ? { verdict: "ok", text: `Idle steady at ${r0(lo)} to ${r0(hi)} rpm.` }
            : { verdict: "look", text: `Idle wanders between ${r0(lo)} and ${r0(hi)} rpm. A cold engine idles higher for a while; if it still hunts when warm, look at air leaks, the idle control and the injectors.` },
        ];
        const trims = (c.trims ?? []).filter((k) => has(r, k));
        if (trims.length) {
          const total = trims.reduce((a, k) => a + mean(r.series[k]), 0);
          out.push(
            Math.abs(total) <= 10
              ? { verdict: "ok", text: `Fuel trims together ${total > 0 ? "+" : ""}${r1(total)} %: the mixture is fine.` }
              : { verdict: "look", text: `Fuel trims together ${total > 0 ? "+" : ""}${r1(total)} %: the engine is adding ${total > 0 ? "fuel, so it sees too much air (an air leak or a dirty air flow sensor)" : "less fuel, so it runs rich (a leaking injector or high fuel pressure)"}.` },
          );
        }
        return out;
      },
    });

    if (c.followRevs?.length)
      checks.push({
        id: "revs",
        title: "Rev test",
        ask: "In neutral, rev the engine to about 2,500 rpm and let it drop back, four times over 20 seconds.",
        engineRunning: true,
        seconds: 20,
        guide: { channel: rpm, low: 800, high: 2500, period: 5, up: "Rev to 2,500", down: "Let it drop" },
        watch: [rpm, ...c.followRevs],
        judge: (r) => {
          if (!has(r, rpm)) return [notRead(label(rpm))];
          const v = r.series[rpm];
          if (pct(v, 0.95) - pct(v, 0.05) < 800) return [{ verdict: "unclear", text: `The revs only moved ${r0(Math.min(...v))} to ${r0(Math.max(...v))} rpm. Rev to about 2,500 a few times and run it again.` }];
          return c.followRevs!.map((k): Finding => {
            if (!has(r, k)) return notRead(label(k));
            const cor = correlation(v, r.series[k]);
            if (cor === null) return { verdict: "look", text: `${label(k)} didn't change at all with the revs. Check that sensor and its plug.` };
            return cor >= 0.7
              ? { verdict: "ok", text: `${label(k)} follows the revs (r = ${cor.toFixed(2)}).` }
              : { verdict: "look", text: `${label(k)} hardly follows the revs (r = ${cor.toFixed(2)}). If a fault names it, check its plug before the part.` };
          });
        },
      });

    if (c.battery) {
      const battery = c.battery;
      checks.push({
        id: "charging",
        title: "Charging under load",
        ask: "Engine idling. Switch on the headlights, the heater fan on full and the heated rear screen, then wait 20 seconds.",
        engineRunning: true,
        seconds: 20,
        watch: [battery, rpm],
        judge: (r) => {
          if (!has(r, battery)) return [notRead(label(battery))];
          if (has(r, rpm) && mean(r.series[rpm]) < 300) return [{ verdict: "unclear", text: "The engine isn't running. Start it and run this again." }];
          const lo = Math.min(...r.series[battery]);
          const hi = Math.max(...r.series[battery]);
          if (hi > 14.8) return [{ verdict: "look", text: `Up to ${r1(hi)} V: that's overcharging. Have the alternator's regulator checked.` }];
          return [
            lo >= 13.2
              ? { verdict: "ok", text: `Charging ${r1(lo)} to ${r1(hi)} V with the loads on: the alternator keeps up.` }
              : { verdict: "look", text: `Down to ${r1(lo)} V with the loads on: the alternator doesn't keep up. Check its belt, its wiring and the battery terminals.` },
          ];
        },
      });
    }

    checks.push({
      id: "wiggle",
      title: "Wiggle test",
      ask: "Engine idling. For 30 seconds, gently wiggle the plug and wiring of a sensor that has a stored fault (or that you suspect).",
      engineRunning: true,
      seconds: 30,
      watch: [rpm],
      faults: true,
      judge: (r) => {
        const before = new Set((r.faultsBefore ?? []).map(faultText));
        const fresh = (r.faultsAfter ?? []).filter((f) => !before.has(faultText(f)));
        const v = r.series[rpm] ?? [];
        const stumble = v.length > 2 && pct(v, 0.95) - pct(v, 0.05) > 150;
        return [
          fresh.length
            ? { verdict: "look", text: `New while wiggling: ${fresh.map(faultText).join("; ")}. That plug or wire is the likely cause.` }
            : { verdict: "ok", text: "No new faults while wiggling." },
          ...(stumble ? [{ verdict: "look" as const, text: `The idle stumbled (${r0(Math.min(...v))} to ${r0(Math.max(...v))} rpm) while wiggling: a loose contact is likely.` }] : []),
        ];
      },
    });

    if (c.coolant) {
      const coolant = c.coolant;
      checks.push({
        id: "warmup",
        title: "Warm-up",
        ask: "Engine idling from cold. Nothing to do for 90 seconds; run it again later to follow the warm-up.",
        engineRunning: true,
        seconds: 90,
        watch: [coolant, rpm],
        judge: (r) => {
          if (!has(r, coolant)) return [notRead(label(coolant))];
          const v = r.series[coolant];
          const first = mean(v.slice(0, Math.max(1, Math.floor(v.length / 5))));
          const last = mean(v.slice(-Math.max(1, Math.floor(v.length / 5))));
          const idle = has(r, rpm) ? r0(mean(r.series[rpm])) : null;
          const at = idle ? `, idle ${idle} rpm` : "";
          if (last - first >= 1) return [{ verdict: "ok", text: `Coolant rising, ${r0(first)} to ${r0(last)} °C${at}.` }];
          if (last >= 75) return [{ verdict: "ok", text: `Coolant ${r0(last)} °C: warm, holding steady${at}.` }];
          return [{ verdict: "look", text: `Coolant stayed at ${r0(last)} °C for 90 seconds${at}. Engines warm slowly at idle; if it's still cold after a drive, look at the thermostat and the coolant sensor.` }];
        },
      });
    }
  }
  return checks;
}

/** For a profile without checks of its own: its faults, and every reading for a few seconds. */
export function basicChecks(watch: string[]): CarCheck[] {
  return [
    standardChecks([], {})[0],
    {
      id: "readings",
      title: "Readings",
      ask: "Ignition on, or the engine idling. Nothing to do for 10 seconds.",
      seconds: 10,
      watch,
      judge: (r) => {
        const missing = watch.filter((k) => !has(r, k));
        return [
          missing.length < watch.length
            ? { verdict: "ok", text: `${watch.length - missing.length} of ${watch.length} readings answered.` }
            : { verdict: "unclear", text: "No readings answered." },
        ];
      },
    },
  ];
}

/**
 * The readings a profile hasn't had verified on a car yet (`confidence` other than "verified"): read
 * with the engine idling, each said back with its range, out-of-range ones flagged. The person compares
 * them with the car's own gauges where it has them; their answers are what lets a maintainer mark a
 * reading verified. The runtime adds this check to every profile that has such readings.
 */
export function unverifiedCheck(channels: Channel[]): CarCheck | null {
  const open = channels.filter((c) => c.confidence !== "verified");
  if (!open.length) return null;
  return {
    id: "unverified",
    title: "Readings not verified yet",
    ask: "Engine idling. Keep an eye on the car's own gauges (temperature, rev counter, speedo) while Openhood reads for 15 seconds, then say what they show.",
    engineRunning: true,
    seconds: 15,
    watch: open.map((c) => c.key),
    judge: (r) =>
      open.map((c): Finding => {
        const v = r.series[c.key];
        if (!v?.length) return { verdict: "unclear", text: `${c.label} didn't answer: this car may not have it.` };
        const lo = Math.min(...v);
        const hi = Math.max(...v);
        const f = (x: number) => x.toFixed(c.decimals);
        const unit = c.unit ? ` ${c.unit}` : "";
        const seen = lo === hi ? `${f(lo)}${unit}` : `${f(lo)} to ${f(hi)}${unit}`;
        if (lo < c.min || hi > c.max)
          return { verdict: "look", text: `${c.label} read ${seen}, outside the ${f(c.min)} to ${f(c.max)}${unit} it can sensibly be: its scaling may be wrong.` };
        return { verdict: "ok", text: `${c.label} read ${seen}. Does the car's own gauge agree, if it has one?` };
      }),
  };
}

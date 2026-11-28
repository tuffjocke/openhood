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
  /** With `steps`: how many the person got through before the check ended, of how many. */
  steps?: { done: number; of: number };
}

export interface CarCheck {
  id: string;
  title: string;
  /** What the person does, in plain words, said to them before the check starts. */
  ask: string;
  /** The engine runs during this check: say the safety note first. */
  engineRunning?: boolean;
  /** How long to read live values; with `steps`, the time limit. 0: no live reading (faults only). At most 120. */
  seconds: number;
  /** Channel keys to read. Unknown or unsupported ones are skipped. */
  watch: string[];
  /** Read the faults before (and, with seconds, after) the readings. */
  faults?: boolean;
  /**
   * One thing at a time for the person to do, each done when the car's reading shows it (the brake
   * switch on, the revs up), `rounds` times over. The live view shows only the step at hand. The
   * check ends once the last one is done, or after `seconds` at the latest.
   */
  steps?: CheckStep[];
  /** How many times to go through `steps`, counted on screen ("2 of 4"). Default 1. */
  rounds?: number;
  /** `ask` worded for this car and connection: the part to touch, the adapter it has. */
  askFor?: (c: CheckContext) => string;
  /** Said instead of the usual when the car stops answering during this check. */
  lost?: string;
  judge(r: CheckReading): Finding[];
}

/** One step of a check: what to do now, and the reading that shows it was done. */
export interface CheckStep {
  /** What to do now, in a few words: "Press the brake pedal". */
  say: string;
  /** The reading that shows it was done. */
  channel: string;
  /** Done when the reading is at least this, */
  above?: number;
  /** or at most this, */
  below?: number;
  /** and has stayed so for this many seconds, counted down on screen. */
  hold?: number;
  /** Where to take the reading, marked on its dial: 2,500 rpm in the rev test. */
  target?: number;
}

/** What a check's wording can depend on. */
export interface CheckContext {
  /** How the car is connected: "kkl", "elm327" or "simulator". */
  adapter: string;
  /** The faults stored now as last read, or null before a read. */
  faults: Fault[] | null;
  /** A fault's everyday name, from the profile's explanations. */
  faultName?: (f: Fault) => string;
}

/** What to tell the person before a check, worded for this car and connection when known. */
export const askOf = (c: CarCheck, ctx?: CheckContext) => (ctx && c.askFor ? c.askFor(ctx) : c.ask);

/** How far a check with steps has got: the step at hand (counted over all rounds), and since when its reading has been right. */
export interface StepProgress {
  at: number;
  /** Seconds into the check the step's reading became right, for `hold`; null while it isn't. */
  since: number | null;
}

/** The step at hand, as the live view shows it. */
export interface StepCue {
  say: string;
  channel: string;
  target?: number;
  /** This round and how many in all, from 1. */
  round: number;
  rounds: number;
  hold?: number;
  /** Seconds into the check the reading became right, while it holds. */
  since: number | null;
}

export const stepCount = (c: CarCheck) => (c.steps?.length ?? 0) * (c.rounds ?? 1);
export const stepsDone = (c: CarCheck, p: StepProgress) => p.at >= stepCount(c);

/**
 * Move a check's steps on with one reading, `t` seconds into the check: the step at hand is done
 * once its channel has been right for its `hold`. At most one step per reading. A reading without
 * the step's channel changes nothing.
 */
export function advanceSteps(c: CarCheck, p: StepProgress, values: Record<string, number>, t: number): StepProgress {
  if (!c.steps?.length || stepsDone(c, p)) return p;
  const step = c.steps[p.at % c.steps.length];
  const v = values[step.channel];
  if (v === undefined) return p;
  const right = (step.above === undefined || v >= step.above) && (step.below === undefined || v <= step.below);
  if (!right) return p.since === null ? p : { at: p.at, since: null };
  const since = p.since ?? t;
  return t - since >= (step.hold ?? 0) ? { at: p.at + 1, since: null } : { at: p.at, since };
}

/** The step at hand for the live view, or null with no steps or all of them done. */
export function stepCue(c: CarCheck, p: StepProgress): StepCue | null {
  if (!c.steps?.length || stepsDone(c, p)) return null;
  const s = c.steps[p.at % c.steps.length];
  return { say: s.say, channel: s.channel, target: s.target, round: Math.floor(p.at / c.steps.length) + 1, rounds: c.rounds ?? 1, hold: s.hold, since: p.since };
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

/** The connection to wiggle, named after the hardware the person has. */
export const connectionPart = (adapter: string) =>
  adapter === "elm327" ? "the adapter where it plugs into the car" : adapter === "kkl" ? "the KKL cable's connector where it plugs into the car" : "the cable's connector where it plugs into the car";

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
          ? [{ verdict: "look", text: `${f.length} stored: ${f.map(faultText).join("; ")}. Some are normal on some cars, so see what each one means before going on.` }]
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
        ask: "In neutral, rev the engine to about 2,500 rpm and let it drop back to idle, four times. Openhood follows the revs and says when.",
        engineRunning: true,
        // A time limit: the check ends after the fourth rev.
        seconds: 45,
        // Up counts from 2,300 and back from 1,500, so a cold engine's higher idle still counts as back.
        steps: [
          { say: "Rev up", channel: rpm, above: 2300, target: 2500 },
          { say: "Let go", channel: rpm, below: 1500, target: 800 },
        ],
        rounds: 4,
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
      ask: "Engine idling. For 30 seconds, gently wiggle the plug and wiring of the part a stored fault names or, with none stored, the adapter where it plugs into the car.",
      // The part to touch: what a stored fault names, else the connection itself, named after the hardware.
      askFor: ({ adapter, faults, faultName }) => {
        if (faults?.length) {
          const names = [...new Set(faults.map((f) => faultName?.(f) ?? faultText(f)))];
          const list = names.length > 3 ? `${names.slice(0, 3).join("; ")} and ${names.length - 3} more` : names.join("; ");
          return `Engine idling. For 30 seconds, gently wiggle the plug and wiring of the part ${names.length > 1 ? "each stored fault names" : "the stored fault names"}: ${list}.`;
        }
        return `Engine idling. No fault is stored, so test the connection: for 30 seconds, gently wiggle ${connectionPart(adapter)}.`;
      },
      lost: "The car stopped answering while you wiggled, so a contact is loose: most likely the plug you were moving. Check it, then run this again.",
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

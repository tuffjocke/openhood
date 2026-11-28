/**
 * Test checks for the Td5 (core/checks.ts): the standard set with this engine's channels, plus the
 * pedal switches found on a Defender (issue #23). Faults that are normal on a Defender are said so
 * by their explanations (fault-explanations.ts), which the agent reads with each fault.
 */
import { standardChecks, type CarCheck } from "@/core/checks";
import { channels } from "./data";

const pedalSwitches: CarCheck = {
  id: "switches",
  title: "Pedal switches",
  ask: "Ignition on or idling. Press the brake pedal, hold it 3 seconds and let go, then the same with the clutch. Openhood says each step.",
  // A time limit: the check ends once both pedals have been pressed and let go.
  seconds: 40,
  // The switch bits from 21 1E (data.ts): 1 while the pedal is pressed.
  steps: [
    { say: "Press the brake pedal", channel: "brake", above: 1, hold: 3 },
    { say: "Let go of it", channel: "brake", below: 0 },
    { say: "Now press the clutch pedal", channel: "clutch", above: 1, hold: 3 },
    { say: "Let go of it", channel: "clutch", below: 0 },
  ],
  watch: ["brake", "clutch"],
  judge: (r) =>
    (["brake", "clutch"] as const).map((k) => {
      const name = k === "brake" ? "Brake" : "Clutch";
      const v = r.series[k] ?? [];
      if (!v.length) return { verdict: "unclear" as const, text: `${name} switch didn't answer.` };
      // The ECU uses the brake switch to cut cruise and the clutch switch for smooth gear changes.
      return v.some((x) => x === 1) && v.some((x) => x === 0)
        ? { verdict: "ok" as const, text: `${name} pedal switch works.` }
        : { verdict: "look" as const, text: `${name} pedal switch didn't change. If you pressed it, check the switch at the top of the pedal and its plug.` };
    }),
};

export const checks: CarCheck[] = [
  ...standardChecks(channels, {
    rpm: "rpm",
    battery: "battery",
    coolant: "coolant",
    temperatures: ["coolant", "airTemp", "fuelTemp"],
    // Not boost: a turbo builds little of it when revved with no load, so it wouldn't follow the revs.
    followRevs: ["maf"],
  }),
  pedalSwitches,
];

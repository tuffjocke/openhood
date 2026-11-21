/**
 * Faults for VW Group engine ECUs on KWP1281.
 *
 * The ECU sends each fault as a code and an "elaboration" (what is wrong with it). Codes 0x4000 to
 * 0x7FFF are standard OBD codes (P0300) and use the shared OBD explanations; the rest are VAG's own
 * five-digit codes (00522). Names for those come from names.ts; the explanations below are our own,
 * written for people who aren't mechanics (see the writing guide in profiles/shared/obd-codes.ts).
 */
import type { EcuLink, Fault, FaultInfo, Urgency } from "@/core/profile";
import { faultCodeText, parseFaults, TITLE } from "@/core/kwp1281/protocol";
import { OBD_EXPLANATIONS, OBD_TITLES } from "../shared/obd-codes";

const say = (title: string, plain: string, causes: string[], check: string, urgency: Urgency): FaultInfo => ({
  title,
  plain,
  causes,
  check,
  urgency,
  confidence: "community",
});

/** Our explanations of the VAG engine codes people meet most, by code as shown. */
const VAG_EXPLANATIONS: Record<string, FaultInfo> = {
  "00513": say(
    "Engine can't tell how fast it's turning",
    "The engine computer lost the signal that counts crankshaft turns. Without it the engine may not start, or may cut out.",
    ["Crank sensor or its plug", "Damaged wire near the gearbox", "Dirt on the sensor"],
    "Look at the sensor's plug and wire near the gearbox for damage or oil.",
    "now",
  ),
  "00515": say(
    "Engine can't see the camshaft position",
    "The engine computer lost the signal that tells it which cylinder is firing. It often still runs, but may start slowly.",
    ["Camshaft sensor (on the cylinder head)", "Its plug or wire", "Timing belt jumped a tooth"],
    "Check the plug on the camshaft sensor at the end of the cylinder head.",
    "soon",
  ),
  "00518": say(
    "Throttle sensor gives a wrong reading",
    "The engine computer can't tell how far the throttle is open. Idle may hunt and the engine can feel flat.",
    ["Worn throttle sensor", "Plug or wire on the throttle body", "Dirty throttle body"],
    "Check the plug on the throttle body and clean the throttle if it's dirty.",
    "soon",
  ),
  "00519": say(
    "Intake pressure sensor gives a wrong reading",
    "The sensor that measures how hard the engine pulls air has a fault. Expect poor running and higher fuel use.",
    ["Pressure sensor or its plug", "Split vacuum hose to the sensor", "Wiring"],
    "Look for a cracked or loose vacuum hose to the sensor.",
    "soon",
  ),
  "00522": say(
    "Coolant temperature sensor gives a wrong reading",
    "The engine computer can't trust the engine temperature. Cold starts get hard, fuel use goes up and the fan may run all the time.",
    ["Coolant temperature sensor", "Its plug (often corroded)", "Wiring"],
    "Unplug the sensor, check the pins for green corrosion and plug it back firmly.",
    "soon",
  ),
  "00523": say(
    "Intake air temperature sensor gives a wrong reading",
    "The sensor for the temperature of the air going in has a fault. The engine runs, but less well.",
    ["Air temperature sensor or its plug", "Wiring"],
    "Check the plug on the sensor in the intake.",
    "ok",
  ),
  "00524": say(
    "Knock sensor gives a wrong reading",
    "The sensor that listens for knocking has a fault, so the engine computer retards the timing to be safe. Power drops a little.",
    ["Knock sensor or its plug", "Sensor bolt not tight", "Wiring"],
    "Check the knock sensor's plug on the engine block.",
    "soon",
  ),
  "00525": say(
    "Oxygen sensor gives a wrong reading",
    "The sensor in the exhaust that checks the fuel mixture has a fault. Fuel use and emissions go up.",
    ["Worn oxygen sensor", "Its plug or wire near the exhaust", "Exhaust leak before the sensor"],
    "Check the sensor's wire for melting near the exhaust.",
    "soon",
  ),
  "00532": say(
    "Supply voltage is wrong",
    "The engine computer saw the battery voltage too high or too low. This can cause odd faults all over the car.",
    ["Weak or old battery", "Alternator not charging", "Loose or corroded battery clamp"],
    "With the engine running, the battery should read about 13.5 to 14.5 V.",
    "soon",
  ),
  "00533": say(
    "Idle speed control can't hold the idle",
    "The engine computer couldn't keep the idle where it wants it. Idle may be rough, too high or the engine stalls.",
    ["Dirty throttle body or idle valve", "Air leak in a hose", "Throttle needs a basic setting"],
    "Clean the throttle body and look for loose or split hoses.",
    "soon",
  ),
  "00537": say(
    "Fuel mixture control hit its limit",
    "The engine computer had to correct the fuel mixture more than it's allowed to. Usually air is getting in or fuel isn't.",
    ["Air leak after the air flow meter", "Oxygen sensor", "Weak fuel pump or blocked filter"],
    "Listen for hissing around intake hoses with the engine running.",
    "soon",
  ),
  "00543": say(
    "Engine was revved past its limit",
    "The engine computer recorded the engine going over its maximum speed, for example after a missed gear.",
    ["A missed gear change", "Wheel spin with the clutch in"],
    "Nothing to check if it happened once; clear it and watch if it comes back.",
    "ok",
  ),
  "00553": say(
    "Air flow meter gives a wrong reading",
    "The sensor measuring air into the engine has a fault. Power drops and the engine may run rough or smoke.",
    ["Worn air flow meter", "Its plug", "Split hose after the meter"],
    "Check the plug and the big hose between the air filter and the engine.",
    "soon",
  ),
  "00561": say(
    "Fuel mixture adaptation hit its limit",
    "The engine computer has learned a correction that's too big. Something makes the mixture wrong all the time.",
    ["Air leak in the intake", "Injector or fuel pressure problem", "Oxygen sensor"],
    "Look for split vacuum hoses and a loose oil filler cap.",
    "soon",
  ),
  "00575": say(
    "Intake pressure is wrong",
    "The pressure in the intake isn't what the engine computer expects. On a turbo engine, boost may be too low or too high.",
    ["Leaking boost hose", "Turbo control valve", "Pressure sensor"],
    "Check the boost hoses for splits and loose clips.",
    "soon",
  ),
  "00586": say(
    "Exhaust gas recirculation isn't working right",
    "The system that sends some exhaust back into the engine isn't doing what it should. Expect smoke or flat spots.",
    ["Sticking or sooted EGR valve", "Split vacuum hose to the valve", "Control valve"],
    "Check the vacuum hoses to the EGR valve.",
    "soon",
  ),
  "00625": say(
    "No road speed signal",
    "The engine computer isn't getting the car's speed. The speedometer may not work and idle can be unsteady when rolling.",
    ["Speed sensor on the gearbox", "Its plug or wire", "Instrument cluster"],
    "Check if the speedometer works. If not, look at the speed sensor's plug on the gearbox.",
    "soon",
  ),
  "00668": say(
    "Battery voltage at the engine computer is wrong",
    "The main power feed to the engine computer is out of range. This can cause poor starting and odd faults.",
    ["Weak battery", "Corroded battery clamp or earth strap", "Alternator"],
    "Clean and tighten the battery clamps and the earth strap to the body.",
    "soon",
  ),
  "01087": say(
    "Throttle basic setting not done",
    "The engine computer hasn't learned the throttle's closed position, usually after a battery change or cleaning. Idle may be uneven.",
    ["Battery was disconnected", "Throttle body cleaned or replaced"],
    "A garage can run the basic setting with a VAG tool in a few minutes.",
    "ok",
  ),
  "01165": say(
    "Throttle unit has a fault",
    "The electric throttle isn't working as it should. The engine may go into a limp mode with little power.",
    ["Dirty throttle body", "Worn throttle unit", "Plug or wiring"],
    "Clean the throttle body and check its plug.",
    "soon",
  ),
  "01247": say(
    "Fuel vapour valve has a fault",
    "The valve that lets fuel tank vapours into the engine has an electrical fault. The car drives normally.",
    ["Vapour valve or its plug", "Wiring"],
    "Check the plug on the small valve near the intake.",
    "ok",
  ),
  "01259": say(
    "Fuel pump relay has a fault",
    "The relay that powers the fuel pump has a fault. The engine may not start or may cut out.",
    ["Fuel pump relay", "Corroded relay socket", "Wiring"],
    "Swap in a new relay: it's cheap and in the fuse box.",
    "now",
  ),
};

/** Everything this profile can explain: VAG codes and standard OBD codes. */
export const EXPLANATIONS: Record<string, FaultInfo> = { ...OBD_EXPLANATIONS, ...VAG_EXPLANATIONS };

/** What the elaboration says is wrong, in our own plain words, for the common ones. */
const ELABORATION: Record<number, string> = {
  0x01: "shorted to plus",
  0x02: "shorted to ground",
  0x03: "no signal",
  0x04: "mechanical fault",
  0x05: "open circuit",
  0x06: "reads too high",
  0x07: "reads too low",
  0x08: "control limit reached",
  0x09: "learned value too high",
  0x0a: "learned value too low",
  0x10: "out of range",
  0x1a: "open circuit",
  0x1b: "doesn't make sense",
  0x1c: "shorted to plus",
  0x1d: "shorted to ground",
  0x1e: "open or shorted to plus",
  0x1f: "open or shorted to ground",
  0x24: "open circuit",
  0x25: "faulty",
};

export async function readFaults(ecu: EcuLink): Promise<Fault[]> {
  const blocks = await ecu.requestMany([TITLE.readFaults], { note: "read faults" });
  const stored = parseFaults(blocks);
  if (!stored.length) return [];
  const { VAG_FAULT_NAMES } = await import("./names");
  return stored.map((f) => {
    const code = faultCodeText(f.code);
    const what = ELABORATION[f.elaboration];
    const state = [what, f.intermittent ? "comes and goes" : ""].filter(Boolean).join(", ");
    return {
      id: code,
      code,
      name: OBD_TITLES[code] ?? VAG_FAULT_NAMES[f.code] ?? "Unknown fault",
      ...(state ? { state } : {}),
    };
  });
}

/** Clear every stored fault. The ECU answers with an ack, or on some with the (now empty) list. */
export async function clearFaults(ecu: EcuLink) {
  await ecu.requestMany([TITLE.clearFaults], { note: "clear faults" });
}

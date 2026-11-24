/**
 * Plain-language explanations of Td5 faults, for people who aren't mechanics.
 * Written for Openhood (not copied), following the writing guide in profiles/shared/obd-codes.ts.
 *
 * The Td5 has 115 distinct fault names, so explanations are grouped into families matched by
 * pattern. The first matching family wins; faults matching none show their official name only.
 * The status (active now / stored) is reported separately as Fault.state.
 */
import type { FaultInfo, Urgency } from "@/core/profile";

interface Family {
  match: RegExp;
  title: (m: RegExpMatchArray) => string;
  plain: string | ((m: RegExpMatchArray) => string);
  causes: string[] | ((m: RegExpMatchArray) => string[]);
  check: string | ((m: RegExpMatchArray) => string);
  urgency: Urgency;
}

const sensorCircuit = (name: string): Pick<Family, "plain" | "causes" | "check"> => ({
  plain: `The ECU is getting a signal from the ${name} that can't be right. It falls back to a default value, so the engine may run less well.`,
  causes: [`Corroded or loose plug on the ${name}`, "Chafed wiring", `Failed ${name}`],
  check: `Unplug the ${name}, look for green corrosion or bent pins, clean and refit.`,
});

const FAMILIES: Family[] = [
  {
    match: /^topside switch failed/,
    title: () => "Injector control switch inside the ECU has failed",
    plain: "A switch inside the engine computer that fires the injectors is failing. The engine can cut out and refuse to restart. Often caused by water getting into the ECU.",
    causes: ["Moisture inside the ECU", "Failed ECU", "Poor ECU earth"],
    check: "Check the ECU and its plugs for water or corrosion.",
    urgency: "now",
  },
  {
    match: /^inj\. (\d) (open circuit|short circuit|partial short circuit)/,
    title: (m) => `Injector ${m[1]} wiring fault`,
    plain: (m) => `The ECU sees an electrical fault on injector ${m[1]}. That cylinder may not fire, so the engine runs rough and lacks power.`,
    causes: (m) => [`Damaged injector harness under the rocker cover`, `Failed injector ${m[1]}`, "Loose injector connector"],
    check: "Check the injector wiring loom under the rocker cover for chafing, and the oil-soaked connector at the head.",
    urgency: "now",
  },
  {
    match: /^inj\. (\d) peak charge (long|short)/,
    title: (m) => `Injector ${m[1]} is slow or quick to respond`,
    plain: (m) => `Injector ${m[1]} takes an unusual time to open electrically. Often a sign of a worn injector or a wiring problem starting.`,
    causes: (m) => [`Worn injector ${m[1]}`, "Oil in the injector harness", "Weak battery voltage"],
    check: "Read injector balance and check the injector loom; oil in the loom is a known Td5 problem.",
    urgency: "soon",
  },
  {
    match: /^injector trim data corrupted/,
    title: () => "Injector calibration data is corrupted",
    plain: "The stored calibration codes for the injectors are invalid. The engine may run rough or smoky until they are re-entered.",
    causes: ["Injectors replaced without coding", "ECU memory problem"],
    check: "Have the injector codes re-programmed with a diagnostic tool that supports it.",
    urgency: "soon",
  },
  {
    match: /^air flow circuit/,
    title: () => "Problem with the air flow sensor",
    ...sensorCircuit("air flow sensor"),
    urgency: "soon",
  },
  {
    match: /^manifold pressure circuit/,
    title: () => "Problem with the boost pressure sensor",
    ...sensorCircuit("boost pressure sensor"),
    urgency: "soon",
  },
  {
    match: /^inlet air temp/,
    title: () => "Problem with the intake air temperature sensor",
    ...sensorCircuit("intake air temperature sensor"),
    urgency: "ok",
  },
  {
    match: /^fuel temp/,
    title: () => "Problem with the fuel temperature sensor",
    ...sensorCircuit("fuel temperature sensor"),
    urgency: "ok",
  },
  {
    match: /^coolant temp/,
    title: () => "Problem with the engine temperature sensor",
    ...sensorCircuit("coolant temperature sensor"),
    urgency: "soon",
  },
  {
    match: /^ambient (air temp|pressure)/,
    title: (m) => (m[1] === "pressure" ? "Problem with the outside air pressure sensor" : "Problem with the outside air temperature sensor"),
    ...sensorCircuit("ambient sensor"),
    urgency: "ok",
  },
  {
    match: /^reference voltage/,
    title: () => "Sensor supply voltage is wrong",
    plain: "The 5 volt supply the ECU gives its sensors is out of range, so several readings can be wrong at once.",
    causes: ["A shorted sensor or wire pulling the supply down", "Water in a connector", "ECU fault"],
    check: "Unplug sensors one at a time with the ignition on and see if the fault clears.",
    urgency: "soon",
  },
  {
    match: /^battery (volts|voltage)/,
    title: () => "Battery voltage problem",
    plain: "The supply voltage to the ECU is too low or too high. Starting can suffer and other faults can appear.",
    causes: ["Weak battery", "Failing alternator", "Corroded battery terminals or earth strap"],
    check: "Check the Battery reading with the engine running: about 13.5 to 14.5 V is normal.",
    urgency: "soon",
  },
  {
    match: /driv(?:er|e) demand|demand supply/,
    title: () => "Problem with the accelerator pedal signal",
    plain: "The two signals from the accelerator pedal don't agree or are out of range. The engine may go into limp mode with little power.",
    causes: ["Worn accelerator pedal sensor", "Corroded pedal connector", "Chafed wiring at the pedal"],
    check: "Check the Pedal sensor reading while pressing slowly: it should rise smoothly without jumps.",
    urgency: "soon",
  },
  {
    match: /^(over boost|turbocharger over boosting)/,
    title: () => "Turbo boost went too high",
    plain: "Boost pressure went above the safe limit, so the ECU cut power to protect the engine.",
    causes: ["Wastegate stuck closed or its pipe split", "Faulty boost pressure sensor", "Engine remap pushing too hard"],
    check: "Check the small vacuum pipes to the wastegate and its modulator for splits.",
    urgency: "soon",
  },
  {
    match: /^(under boost|turbocharger under boosting)/,
    title: () => "Turbo isn't making enough boost",
    plain: "Boost pressure stayed lower than expected. The car feels flat, especially uphill or loaded.",
    causes: ["Split intercooler hose or loose clamp", "Wastegate stuck open", "Worn turbo"],
    check: "Look for oily, split intercooler hoses and loose clamps between turbo, intercooler and manifold.",
    urgency: "soon",
  },
  {
    match: /^turbocharger wastegate/,
    title: () => "Problem with the turbo wastegate control",
    plain: "The part that controls turbo boost has an electrical or vacuum fault. Boost may be too low or the engine may limit power.",
    causes: ["Split vacuum pipe", "Faulty wastegate modulator", "Damaged wiring"],
    check: "Check the wastegate modulator's vacuum pipes and plug.",
    urgency: "soon",
  },
  {
    match: /^egr/,
    title: () => "Problem with the exhaust gas recirculation (EGR)",
    plain: "The system that feeds some exhaust back into the engine has a fault. Many Td5 owners have it removed or blanked; if so, this fault is expected.",
    causes: ["EGR removed or blanked", "Split vacuum pipe to the EGR valve", "Faulty EGR modulator or wiring"],
    check: "Check whether the EGR has been removed. If not, check the vacuum pipes and modulator plug.",
    urgency: "ok",
  },
  {
    match: /crank/,
    title: () => "Problem with the crankshaft position signal",
    plain: "The engine speed signal is noisy or impossible. The engine can misfire, cut out or refuse to start.",
    causes: ["Dirty or failed crankshaft sensor", "Damaged sensor wiring", "Oil in the sensor connector"],
    check: "Check the crank sensor plug and wiring for oil and damage.",
    urgency: "now",
  },
  {
    match: /^fuel pump drive/,
    title: () => "Problem with the fuel pump circuit",
    plain: "The ECU sees an electrical fault in the fuel pump circuit. The engine can stop or refuse to start.",
    causes: ["Failed fuel pump relay", "Corroded fuel pump connector", "Failed in-tank pump"],
    check: "Check the fuel pump relay and fuse, and listen for the pump when you turn the ignition on.",
    urgency: "now",
  },
  {
    match: /^radiator fan drive/,
    title: () => "Problem with the cooling fan circuit",
    plain: "The electric cooling fan may not switch on. Watch the temperature gauge, especially in traffic.",
    causes: ["Failed fan relay", "Damaged fan wiring", "Failed fan motor"],
    check: "Check the fan relay and fuse, and watch the coolant reading while idling warm.",
    urgency: "soon",
  },
  {
    match: /^glow ?plug/,
    title: () => "Problem with the glow plug circuit",
    plain: "The glow plugs or their warning lamp have an electrical fault. Cold starts can be hard and smoky.",
    causes: ["Failed glow plug relay", "Burnt-out glow plugs", "Damaged wiring"],
    check: "Check the glow plug relay, then test each glow plug's resistance.",
    urgency: "soon",
  },
  {
    match: /^road speed missing/,
    title: () => "No road speed signal",
    plain: "The ECU isn't getting a speed signal. Cruise control won't work and the speedometer may stop.",
    causes: ["Failed road speed sensor", "Damaged wiring", "Fault in the ABS unit on models that take speed from it"],
    check: "Check whether the speedometer works, then the speed sensor's plug.",
    urgency: "soon",
  },
  {
    match: /can|remote can mode/,
    title: () => "Communication fault with other modules",
    plain: "The engine computer had trouble talking to the gearbox or ABS unit. Usually harmless on manual Defenders.",
    causes: ["Damaged data wiring", "Fault in the gearbox or ABS module", "Low battery voltage during cranking"],
    check: "Clear it and see if it comes back. On a manual Defender it often appears without a real problem.",
    urgency: "ok",
  },
  {
    // Set on every Defender: these outputs aren't wired there (TD5-Dash, _DEFENDER_EXPECTED).
    match: /^(air conditioning fan drive|air conditioning clutch|tachometer|gearbox\/abs drive) open load/,
    title: () => "Nothing connected to an engine computer output",
    plain: "The engine computer sees nothing connected to its air conditioning, rev counter or gearbox signal output. On a Defender these aren't wired, so this is normal.",
    causes: ["Output not wired on this vehicle (normal on a Defender)", "Broken wire or loose connector", "Failed relay or part"],
    check: "On a Defender, ignore it. Otherwise check that the air conditioning and rev counter work.",
    urgency: "ok",
  },
  {
    match: /^problem detected with auto gear box/,
    title: () => "Problem reported by the automatic gearbox",
    plain: "The automatic gearbox has told the engine computer about a fault of its own.",
    causes: ["Fault stored in the gearbox module", "Damaged wiring between modules"],
    check: "Read the gearbox module's own faults with a tool that supports it.",
    urgency: "soon",
  },
  {
    match: /cruise/,
    title: () => "Problem with cruise control",
    plain: "Cruise control has a fault or switched itself off. The car drives normally otherwise.",
    causes: ["Sticking cruise control switch", "Brake or clutch switch out of adjustment", "Damaged wiring"],
    check: "Check the cruise switches and the brake and clutch pedal switches.",
    urgency: "ok",
  },
  {
    match: /^(temperature gauge|tacho|mil lamp|fuel used output|air conditioning|active engine mounting|gearbox\/abs drive)/,
    title: () => "Fault in a gauge, lamp or accessory circuit",
    plain: "One of the outputs the ECU drives (a gauge, warning lamp, air conditioning or gearbox signal) has a wiring fault. The engine itself is fine.",
    causes: ["Damaged wiring or connector", "Failed bulb or gauge", "Accessory not fitted on this vehicle"],
    check: "Check whether the gauge or lamp in question works; on some vehicles the output isn't used at all.",
    urgency: "ok",
  },
];

export const STATUS: Record<string, string> = {
  Current: "active now",
  Logged: "stored",
  "Logged Low": "stored, signal too low",
  "Logged High": "stored, signal too high or open circuit",
};

/** Split "air flow circuit (Current)" into base name and status. */
export function splitStatus(name: string): { base: string; status?: string } {
  const m = name.match(/^(.*?)\s*\((Current|Logged|Logged Low|Logged High)\)$/);
  return m ? { base: m[1], status: m[2] } : { base: name };
}

export function explainTd5Fault(name: string): FaultInfo | undefined {
  const { base } = splitStatus(name);
  for (const f of FAMILIES) {
    const m = base.match(f.match);
    if (!m) continue;
    const pick = <T,>(v: T | ((m: RegExpMatchArray) => T)) => (typeof v === "function" ? (v as (m: RegExpMatchArray) => T)(m) : v);
    return {
      title: f.title(m),
      plain: pick(f.plain),
      causes: pick(f.causes),
      check: pick(f.check),
      urgency: f.urgency,
      confidence: "community",
    };
  }
  return undefined;
}

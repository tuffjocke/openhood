/**
 * Fault codes for the Volvo 850, S70, V70 and C70 modules that speak keyword D3 B0 (KWPD3B0).
 *
 * Each module sends a one-byte raw code; Volvo's own three-digit codes (ABS-311, SRS-212) come from
 * a lookup table per module, not a formula. The tables below are facts from jonesrh's list of
 * interpreted KWPD3B0 codes (see README), which calls itself a best effort, not a guarantee.
 * Raw codes the list has no three-digit code for are left out and show as the raw number.
 *
 * The explanations are our own, for people who aren't mechanics (writing guide at the top of
 * profiles/shared/obd-codes.ts).
 */
import type { FaultInfo, Urgency } from "@/core/profile";

const say = (title: string, plain: string, causes: string[], check: string, urgency: Urgency): FaultInfo => ({
  title,
  plain,
  causes,
  check,
  urgency,
  confidence: "community",
});

export interface ModuleCodes {
  /** Raw code byte → Volvo code. */
  raw: Record<number, string>;
  explanations: Record<string, FaultInfo>;
}

// ---------------------------------------------------------------------------------------------
// ABS and traction control (module 01)
// ---------------------------------------------------------------------------------------------

const WHEELS = ["left front", "right front", "left rear", "right rear"];
const ABS_KEEPS_BRAKING = "The brakes still work, but ABS and traction control are off until it's fixed.";

const absCodes: ModuleCodes = { raw: {}, explanations: {} };
const abs = (raw: number, code: string, info: FaultInfo) => {
  absCodes.raw[raw] = code;
  absCodes.explanations[code] ??= info;
};

WHEELS.forEach((wheel, i) => {
  const base = 0x10 * (i + 1);
  abs(
    base,
    `ABS-31${i + 1}`,
    say(
      `No signal from the ${wheel} wheel speed sensor`,
      `The ABS unit can't hear the ${wheel} wheel sensor at all. ${ABS_KEEPS_BRAKING}`,
      ["Broken sensor wire near the wheel", "Sensor or its plug", "Cracked solder joints in the ABS unit (common on these cars)"],
      `Follow the ${wheel} sensor wire for chafing and check its plug.`,
      "soon",
    ),
  );
  abs(
    base + 1,
    `ABS-32${i + 1}`,
    say(
      `Unsteady signal from the ${wheel} wheel speed sensor`,
      `The ${wheel} wheel sensor's signal drops out now and then. ${ABS_KEEPS_BRAKING}`,
      ["Rust or dirt on the sensor or toothed ring", "Loose sensor or worn wheel bearing", "Cracked solder joints in the ABS unit"],
      `Take out the ${wheel} sensor, clean it and the ring behind it, and refit it snug.`,
      "soon",
    ),
  );
  abs(
    base + 3,
    `ABS-21${i + 1}`,
    say(
      `The ${wheel} wheel turns at the wrong speed`,
      `The ${wheel} wheel's speed didn't match the others. ${ABS_KEEPS_BRAKING}`,
      ["Tyre of a different size or very low pressure", "Damaged toothed ring", "Sensor too far from the ring"],
      "Check all four tyres are the same size and pressure.",
      "soon",
    ),
  );
  abs(
    base + 4,
    `ABS-22${i + 1}`,
    say(
      `ABS worked the ${wheel} brake for too long`,
      `The ABS unit kept adjusting the ${wheel} brake longer than it should. ${ABS_KEEPS_BRAKING}`,
      ["Weak sensor signal on that wheel", "Very slippery road (then it's harmless)", "Valve in the ABS unit"],
      "If it happened on ice or gravel, clear it and see if it comes back.",
      "ok",
    ),
  );
});

const absValve = (where: string) =>
  say(
    `ABS valve for the ${where} has an electrical fault`,
    `A valve inside the ABS unit isn't working. ${ABS_KEEPS_BRAKING}`,
    ["Cracked solder joints in the ABS unit (common on these cars)", "ABS unit plug", "ABS unit itself"],
    "Check the big plug on the ABS unit is clean and firmly in.",
    "soon",
  );
abs(0x50, "ABS-411", absValve("left front brake"));
abs(0x51, "ABS-413", absValve("right front brake"));
abs(0x52, "ABS-421", absValve("rear brakes"));
abs(0x54, "ABS-412", absValve("left front brake"));
abs(0x55, "ABS-414", absValve("right front brake"));
abs(0x56, "ABS-422", absValve("rear brakes"));
abs(0x60, "ABS-423", absValve("traction control"));
abs(
  0x61,
  "ABS-424",
  say(
    "Traction control pressure switch has a fault",
    "The ABS unit has a problem with the traction control's pressure switch. Traction control may be off; normal braking works.",
    ["Pressure switch or its wiring", "ABS unit"],
    "Check the plugs on the ABS unit.",
    "soon",
  ),
);
abs(
  0x64,
  "ABS-141",
  say(
    "Brake pedal sensor shorted",
    "The sensor that tells the ABS unit you're braking has a wiring fault.",
    ["Brake pedal sensor or its wiring", "Plug under the dashboard"],
    "Look at the wiring at the top of the brake pedal.",
    "soon",
  ),
);
abs(
  0x65,
  "ABS-142",
  say(
    "Brake light switch is faulty or out of adjustment",
    "The ABS unit doesn't trust the brake light switch. Your brake lights may not work right, which matters for the car behind.",
    ["Brake light switch out of adjustment", "Worn switch", "Wiring"],
    "Ask someone to check the brake lights come on as soon as you touch the pedal.",
    "soon",
  ),
);
abs(
  0x66,
  "ABS-144",
  say(
    "Traction control switched off to let the brakes cool",
    "Traction control uses the front brakes, and they got hot, so it turned itself off for a while. Nothing is broken.",
    ["Lots of wheel spin, for example on snow or ice"],
    "Nothing to fix. Clear it if you like.",
    "ok",
  ),
);
abs(
  0x67,
  "ABS-143",
  say(
    "Road speed signal missing or wrong",
    "The ABS unit isn't getting a sensible road speed signal.",
    ["Wheel speed sensor", "Wiring to the instrument cluster", "ABS unit"],
    "Check if the speedometer works normally.",
    "soon",
  ),
);
abs(
  0x70,
  "ABS-443",
  say(
    "ABS pump motor has a fault",
    `The pump inside the ABS unit isn't working right. ${ABS_KEEPS_BRAKING}`,
    ["ABS pump fuse or relay", "Pump motor", "ABS unit plug"],
    "Check the ABS fuses and relay.",
    "soon",
  ),
);
const absUnit = (title: string) =>
  say(
    title,
    `The ABS unit found a problem inside itself. ${ABS_KEEPS_BRAKING}`,
    ["Cracked solder joints in the ABS unit (common on these cars)", "ABS unit failing", "Poor earth or supply"],
    "Check the ABS unit's plug and earth before replacing anything: many units are repaired, not replaced.",
    "soon",
  );
abs(0x72, "ABS-431", absUnit("ABS unit has a hardware fault"));
abs(0x75, "ABS-432", absUnit("ABS unit saw electrical interference"));
abs(
  0x77,
  "ABS-433",
  say(
    "Battery voltage too high for the ABS unit",
    "The ABS unit saw too much voltage. This usually points at charging, not at the ABS.",
    ["Alternator charging too much", "Jump start or battery charger"],
    "With the engine running, the battery should read about 13.5 to 14.5 V.",
    "soon",
  ),
);
abs(0x80, "ABS-441", absUnit("ABS unit's two processors disagree"));
abs(
  0x81,
  "ABS-444",
  say(
    "No power to the ABS valves",
    `The valves in the ABS unit aren't getting power. ${ABS_KEEPS_BRAKING}`,
    ["ABS fuse or relay", "Corroded plug on the ABS unit", "ABS unit"],
    "Check the ABS fuses first: it's the cheapest fix.",
    "soon",
  ),
);
abs(0x82, "ABS-442", absUnit("ABS pump pressure too low or current leaking"));
abs(0x83, "ABS-445", absValve("brakes"));

export const ABS_CODES = absCodes;

// ---------------------------------------------------------------------------------------------
// Airbag and seat belt tensioners, SRS (module 58)
// ---------------------------------------------------------------------------------------------

const srsCodes: ModuleCodes = { raw: {}, explanations: {} };
const MAY_NOT_WORK = "It may not work in a crash, and the airbag light stays on.";

/** The SRS parts that end in 0 to 4: fault, short or faulty signal, open or missing, low, high. */
const SRS_PARTS: [number, string][] = [
  [21, "driver's airbag"],
  [22, "passenger airbag"],
  [23, "left seat belt tensioner"],
  [24, "right seat belt tensioner"],
  [31, "left rear seat belt tensioner"],
  [32, "right rear seat belt tensioner"],
];

const srsPart = (part: string, ending: number): FaultInfo => {
  const what = ["has a fault", "has a short circuit or a bad signal", "is disconnected or its signal is missing", "reads too low or is shorted to ground", "reads too high or is shorted to power"][ending];
  const under = part.includes("airbag") && part.startsWith("driver")
    ? "The clock spring behind the steering wheel (common)"
    : part.includes("passenger")
      ? "Plug behind the glovebox"
      : "Plug under the front seat";
  return say(
    `The ${part} ${what}`,
    `The airbag computer found a wiring problem with the ${part}. ${MAY_NOT_WORK}`,
    [under, "Corroded or loose yellow airbag plug", "The part itself"],
    "Leave airbag parts to a garage: they can go off when handled wrong.",
    "soon",
  );
};

for (const [part, name] of SRS_PARTS)
  for (let e = 0; e <= 4; e++) srsCodes.explanations[`SRS-${part}${e}`] = srsPart(name, e);
srsCodes.explanations["SRS-112"] = say(
  "Airbag computer has an internal fault",
  `The airbag computer found a fault inside itself. ${MAY_NOT_WORK}`,
  ["Airbag computer", "An earlier crash it recorded", "Its supply or earth"],
  "A garage needs to look at it.",
  "soon",
);
srsCodes.explanations["SRS-114"] = srsCodes.explanations["SRS-112"];
srsCodes.explanations["SRS-127"] = say(
  "Airbag warning light circuit is broken",
  "The airbag computer can't drive the warning light, so the light can't warn you of other faults.",
  ["Blown warning bulb in the instruments", "Wiring to the instrument cluster"],
  "Check the airbag light comes on for a few seconds when you turn the key.",
  "soon",
);
srsCodes.explanations["SRS-128"] = srsCodes.explanations["SRS-127"];
srsCodes.explanations["SRS-129"] = say(
  "Battery voltage too low for the airbag computer",
  "The airbag computer saw too little voltage. It often clears once the battery is healthy.",
  ["Weak battery", "Corroded battery clamp or earth", "Alternator"],
  "Charge or test the battery, then clear the code.",
  "soon",
);

// Raw codes from jonesrh's list. Several raw codes share one Volvo code.
Object.assign(srsCodes.raw, {
  0x01: "SRS-112", 0x02: "SRS-211", 0x03: "SRS-212", 0x04: "SRS-213", 0x05: "SRS-214",
  0x06: "SRS-221", 0x07: "SRS-222", 0x08: "SRS-223", 0x09: "SRS-224",
  0x0a: "SRS-231", 0x0b: "SRS-232", 0x0c: "SRS-233", 0x0d: "SRS-234",
  0x0e: "SRS-241", 0x0f: "SRS-242", 0x10: "SRS-243", 0x11: "SRS-244",
  0x52: "SRS-127", 0x53: "SRS-128", 0x65: "SRS-127", 0x66: "SRS-128", 0x67: "SRS-129",
  0x68: "SRS-213", 0x69: "SRS-214", 0x6a: "SRS-233", 0x6b: "SRS-234", 0x6c: "SRS-243", 0x6d: "SRS-244",
  0x6e: "SRS-223", 0x6f: "SRS-224", 0x70: "SRS-313", 0x71: "SRS-314", 0x72: "SRS-323", 0x73: "SRS-324",
  0x78: "SRS-211", 0x79: "SRS-212", 0x7a: "SRS-231", 0x7b: "SRS-232", 0x7c: "SRS-241", 0x7d: "SRS-242",
  0x7e: "SRS-221", 0x7f: "SRS-222", 0x80: "SRS-311", 0x81: "SRS-312", 0x82: "SRS-321", 0x83: "SRS-322",
  0x88: "SRS-210", 0x89: "SRS-230", 0x8a: "SRS-240", 0x8b: "SRS-220", 0x8c: "SRS-310", 0x8d: "SRS-320",
  0xc7: "SRS-114",
});

export const SRS_CODES = srsCodes;

// ---------------------------------------------------------------------------------------------
// Instrument cluster, COMBI (module 51)
// ---------------------------------------------------------------------------------------------

const combiCodes: ModuleCodes = { raw: {}, explanations: {} };
const ci = (raw: number, code: string, info: FaultInfo) => {
  combiCodes.raw[raw] = code;
  combiCodes.explanations[code] ??= info;
};
const speedOut = (kind: string) =>
  say(
    `Speed signal the instruments send out is shorted (${kind})`,
    "The instrument cluster passes the road speed on to other parts of the car, and that wire has a short. Parts that use the speed may act up.",
    ["Chafed wire behind the instruments", "A part that uses the signal"],
    "A garage can find the short with the wiring diagram.",
    "ok",
  );
const fuelLevel = (title: string) =>
  say(
    title,
    "The fuel gauge can't trust the sender in the tank, so the gauge may read wrong. Don't rely on it until fixed.",
    ["Fuel level sender in the tank", "Plug on top of the tank", "Wiring"],
    "Fill up and note the mileage, so you know when you'll need fuel.",
    "ok",
  );
ci(0x01, "CI-222", say("Road speed signal too high", "The instruments got a road speed that's too high to be real. The speedometer may jump.", ["Wheel speed sensor signal", "ABS unit"], "Watch whether the speedometer jumps while driving.", "ok"));
ci(0x02, "CI-221", say("No road speed signal", "The instruments aren't getting the road speed, so the speedometer and odometer may stop. On these cars the cause is very often the ABS unit.", ["Cracked solder joints in the ABS unit (very common)", "Wiring from the ABS unit", "Instrument cluster"], "If the ABS light is on too, start with the ABS unit.", "soon"));
ci(0x03, "CI-114", fuelLevel("Fuel gauge reading hasn't moved for a long time"));
ci(0x04, "CI-112", fuelLevel("Fuel level signal is shorted to ground"));
ci(0x05, "CI-113", fuelLevel("Fuel level signal is broken or the tank is very low"));
ci(0x06, "CI-121", say("Coolant temperature signal is faulty", "The temperature gauge isn't getting a good signal, so you can't trust it. Overheating could go unnoticed.", ["Temperature sender or its plug", "Wiring to the instruments"], "Keep an eye on the coolant level until it's fixed.", "soon"));
ci(0x07, "CI-123", speedOut("to power"));
ci(0x08, "CI-143", speedOut("to ground"));
ci(0x09, "CI-131", speedOut("to power"));
ci(0x0a, "CI-141", speedOut("to ground"));
ci(0x0b, "CI-132", say("No engine speed signal", "The rev counter isn't getting the engine's speed.", ["Wiring from the engine computer", "Engine computer", "Instrument cluster"], "Check whether the rev counter moves.", "ok"));
ci(0x0c, "CI-124", say("Engine speed signal is faulty", "The rev counter gets an unsteady engine speed signal.", ["Wiring from the engine computer", "Instrument cluster"], "Watch whether the rev counter jumps.", "ok"));
ci(0x0d, "CI-211", say("Alternator not charging", "The charging signal was missing for a while with the engine running. The battery may run flat.", ["Alternator", "Slipping drive belt", "Wire to the alternator"], "With the engine running, the battery should read about 13.5 to 14.5 V.", "soon"));
ci(0x0e, "CI-133", say("Fuel level signal to the trip computer is shorted to power", "The trip computer's fuel reading has a wiring fault, so range and fuel use figures may be wrong.", ["Chafed wire behind the instruments", "Trip computer"], "A garage can find the short with the wiring diagram.", "ok"));
ci(0x0f, "CI-142", say("No outside temperature signal", "The outside temperature reading is missing.", ["Outside temperature sensor behind the bumper", "Its wiring"], "Look at the sensor and its wire behind the front bumper.", "ok"));
ci(0x10, "CI-231", say("Instrument cluster has an internal fault", "The instrument cluster found a fault inside itself. Gauges may not be reliable.", ["Instrument cluster", "Its supply or earth"], "A specialist can repair or replace the cluster.", "soon"));
ci(0x11, "CI-174", say("Fuel level and fuel use don't agree", "The fuel gauge and the fuel used don't add up.", ["Fuel level sender", "Fuel leak", "Fuel use signal"], "Check under the car for fuel smell or drips.", "soon"));
ci(0x20, "CI-232", say("Instrument cluster isn't set up", "The instrument cluster hasn't been programmed for this car, usually after it was replaced.", ["Replacement cluster not programmed"], "A Volvo specialist can set it up.", "ok"));

export const COMBI_CODES = combiCodes;

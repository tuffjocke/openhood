/**
 * Generic OBD-II trouble codes, shared by every profile whose ECU reports standard codes.
 *
 * - OBD_TITLES: the official short titles (SAE J2012), summarised at
 *   https://en.wikipedia.org/wiki/OBD-II_PIDs and in many public code lists.
 * - OBD_EXPLANATIONS: our own plain-language explanations for people who aren't mechanics.
 *   Causes are the commonly reported ones, most likely first. Urgency is guidance, not a promise.
 *
 * Writing guide for new entries:
 *  - Title: what is wrong, in everyday words. No jargon like "lean", "bank", "circuit" without explaining.
 *  - Plain: one or two short sentences. What it means, and what happens if you ignore it.
 *  - Causes: 2 to 4, cheapest and most common first.
 *  - Check: the first thing a home mechanic can look at.
 *  - Urgency: "ok" fine to drive, "soon" get it fixed soon, "now" risk of damage or unsafe.
 *  - Never copy text from code lists or workshop manuals. Write it yourself.
 *
 * How this file is laid out: every code is added once with `add(code, official title, explanation)`,
 * so a title can't exist without an explanation. Codes that only differ by cylinder, sensor position
 * or "reads low / reads high" share a small function. Sections follow the code numbers.
 *
 * Words used for positions:
 *  - "bank 1" is the row of cylinders with cylinder 1, "bank 2" the other row (V and boxer engines).
 *  - "sensor 1" sits before the catalytic converter, "sensor 2" after it.
 */
import type { FaultInfo, Urgency } from "@/core/profile";

export const OBD_TITLES: Record<string, string> = {};
export const OBD_EXPLANATIONS: Record<string, FaultInfo> = {};

const add = (code: string, official: string, info: FaultInfo) => {
  if (OBD_TITLES[code]) throw new Error(`${code} is listed twice`);
  OBD_TITLES[code] = official;
  OBD_EXPLANATIONS[code] = info;
};

const say = (title: string, plain: string, causes: string[], check: string, urgency: Urgency): FaultInfo => ({
  title,
  plain,
  causes,
  check,
  urgency,
  confidence: "community",
});

/** The usual four variants of a sensor code: no signal, doesn't make sense, reads low, reads high. */
type Kind = "circuit" | "range" | "low" | "high" | "intermittent";
const OFFICIAL_KIND: Record<Kind, string> = {
  circuit: "circuit",
  range: "range/performance",
  low: "circuit low",
  high: "circuit high",
  intermittent: "circuit intermittent",
};

// ---------------------------------------------------------------------------------------------
// P000x to P002x: camshaft timing
// ---------------------------------------------------------------------------------------------

const camSide = (bank: 1 | 2) => (bank === 1 ? "" : " on the second row of cylinders");
const camName = (cam: "A" | "B") => (cam === "A" ? "intake" : "exhaust");

const camValve = (code: string, cam: "A" | "B", bank: 1 | 2) =>
  add(
    code,
    `"${cam}" camshaft position actuator circuit, bank ${bank}`,
    say(
      "Problem with a valve timing control valve",
      `The oil valve that adjusts the ${camName(cam)} camshaft timing${camSide(bank)} isn't responding. The engine may feel flat and use more fuel.`,
      ["Damaged plug or wiring to the valve", "Failed timing control valve", "Dirty or low engine oil"],
      "Check the oil level and the plug on the timing control valve at the front of the engine.",
      "soon",
    ),
  );

const camTiming = (code: string, cam: "A" | "B", bank: 1 | 2, dir: "advanced" | "retarded") =>
  add(
    code,
    `"${cam}" camshaft timing over-${dir}, bank ${bank}`,
    say(
      `Valve timing is too ${dir === "advanced" ? "early" : "late"}`,
      `The ${camName(cam)} camshaft${camSide(bank)} isn't where the engine asked for. It may idle rough, feel weak or stall. A stretched timing chain can do real damage if left.`,
      ["Low, old or wrong engine oil", "Sticking timing control valve", "Worn camshaft adjuster", "Stretched timing chain"],
      "Check the oil level and when it was last changed. Fresh oil of the right grade fixes many of these.",
      "soon",
    ),
  );

camValve("P0010", "A", 1);
camTiming("P0011", "A", 1, "advanced");
camTiming("P0012", "A", 1, "retarded");
camValve("P0013", "B", 1);
camTiming("P0014", "B", 1, "advanced");
camTiming("P0015", "B", 1, "retarded");
camValve("P0020", "A", 2);
camTiming("P0021", "A", 2, "advanced");
camTiming("P0022", "A", 2, "retarded");

const camCrank = (code: string, bank: 1 | 2, sensor: "A" | "B") =>
  add(
    code,
    `Crankshaft/camshaft position correlation, bank ${bank} sensor ${sensor}`,
    say(
      "Crankshaft and camshaft are out of step",
      `The ${camName(sensor)} camshaft${camSide(bank)} isn't lined up with the crankshaft. Often a stretched chain or a belt that has jumped a tooth. Driving on can wreck the engine.`,
      ["Stretched timing chain or worn tensioner", "Timing belt jumped a tooth", "Sticking camshaft adjuster", "Faulty camshaft or crankshaft sensor"],
      "Listen for a rattle from the timing chain at cold start. If it rattles, don't drive it far.",
      "now",
    ),
  );

camCrank("P0016", 1, "A");
camCrank("P0017", 1, "B");
camCrank("P0018", 2, "A");
camCrank("P0019", 2, "B");

// ---------------------------------------------------------------------------------------------
// P003x to P005x and P013x to P016x: oxygen sensors
// ---------------------------------------------------------------------------------------------

type O2 = { bank: 1 | 2; sensor: 1 | 2 };
const o2Label = ({ bank, sensor }: O2) => `bank ${bank} sensor ${sensor}`;
const o2Name = ({ sensor }: O2) => (sensor === 1 ? "front oxygen sensor" : "rear oxygen sensor");
const o2Where = ({ bank, sensor }: O2) =>
  `${sensor === 1 ? "before" : "after"} the catalytic converter${bank === 2 ? " on the second row of cylinders" : ""}`;

const o2Heater = (code: string, at: O2, official: string) =>
  add(
    code,
    `${official}, ${o2Label(at)}`,
    say(
      `The ${o2Name(at)}'s heater isn't working`,
      `The oxygen sensor ${o2Where(at)} has a small heater so it works soon after a cold start. It has failed. Slightly more fuel used when cold, otherwise little effect.`,
      ["Worn-out oxygen sensor (the heater is built in)", "Blown fuse for the sensor heaters", "Damaged wiring near the exhaust"],
      "Check the fuse for the oxygen sensor heaters, then the wiring for melted spots near the exhaust.",
      at.sensor === 1 ? "soon" : "ok",
    ),
  );

const o2Signal = (code: string, at: O2, official: string, title: string, plain: string) =>
  add(
    code,
    `${official}, ${o2Label(at)}`,
    say(
      title,
      plain,
      at.sensor === 1
        ? ["Worn oxygen sensor", "Exhaust leak before the sensor", "Damaged wiring near the exhaust", "Air leak in the intake"]
        : ["Worn oxygen sensor", "Exhaust leak near the sensor", "Damaged wiring near the exhaust"],
      "Look at the sensor wiring for melted or chafed spots, and listen for an exhaust leak (ticking when cold).",
      at.sensor === 1 ? "soon" : "ok",
    ),
  );

/** The six codes each sensor position has: circuit, low, high, slow, no activity, heater. */
const o2Set = (first: number, at: O2) => {
  const p = (n: number) => `P0${first + n}`;
  const name = o2Name(at);
  const where = o2Where(at);
  const effect = at.sensor === 1 ? "Fuel use can go up and emissions get worse." : "The car drives fine, but it can't check the catalytic converter.";
  o2Signal(p(0), at, "O2 sensor circuit", `Problem with the ${name}`, `The sensor that checks the exhaust ${where} isn't working right. ${effect}`);
  o2Signal(p(1), at, "O2 sensor circuit low voltage", `The ${name} reads too low`, `The sensor ${where} keeps saying there is too much air in the exhaust. ${effect}`);
  o2Signal(p(2), at, "O2 sensor circuit high voltage", `The ${name} reads too high`, `The sensor ${where} keeps saying there is too much fuel in the exhaust. ${effect}`);
  o2Signal(p(3), at, "O2 sensor circuit slow response", `The ${name} is slow`, `The sensor ${where} reacts too slowly, usually from age. ${effect}`);
  o2Signal(p(4), at, "O2 sensor circuit no activity detected", `The ${name} shows no signal`, `The sensor ${where} isn't sending anything useful. ${effect}`);
  o2Heater(p(5), at, "O2 sensor heater circuit");
};

const o2HeaterSet = (first: number, at: O2) => {
  const p = (n: number) => `P00${first + n}`;
  o2Heater(p(0), at, "HO2S heater control circuit");
  o2Heater(p(1), at, "HO2S heater control circuit low");
  o2Heater(p(2), at, "HO2S heater control circuit high");
};

o2HeaterSet(30, { bank: 1, sensor: 1 });
o2HeaterSet(36, { bank: 1, sensor: 2 });
o2HeaterSet(50, { bank: 2, sensor: 1 });
o2HeaterSet(56, { bank: 2, sensor: 2 });

// ---------------------------------------------------------------------------------------------
// P008x: fuel pressure
// ---------------------------------------------------------------------------------------------

add(
  "P0087",
  "Fuel rail/system pressure too low",
  say(
    "Fuel pressure is too low",
    "The engine isn't getting fuel at the pressure it needs. It may lose power under load, hesitate or cut out. On diesels, a failing pump can spread metal through the system.",
    ["Clogged fuel filter", "Weak fuel pump", "Faulty fuel pressure regulator or sensor", "Leak in a fuel line"],
    "Change the fuel filter if it is due. Look and smell for fuel leaks.",
    "now",
  ),
);
add(
  "P0088",
  "Fuel rail/system pressure too high",
  say(
    "Fuel pressure is too high",
    "Fuel is reaching the engine at more pressure than it asked for. It can run rough, smoke and use more fuel.",
    ["Faulty fuel pressure regulator", "Blocked fuel return line", "Faulty fuel pressure sensor"],
    "Check the plug on the fuel pressure sensor and regulator on the fuel rail.",
    "soon",
  ),
);

// ---------------------------------------------------------------------------------------------
// P010x to P012x: air, pressure, temperature and throttle sensors
// ---------------------------------------------------------------------------------------------

const airFlow = (code: string, kind: Kind, title: string, plain: string) =>
  add(
    code,
    `Mass air flow ${OFFICIAL_KIND[kind]}`,
    say(
      title,
      plain,
      ["Dirty air flow sensor", "Loose or cracked air intake hose", "Damaged sensor plug or wiring", "Failed air flow sensor"],
      "Look for a loose clamp or split hose between the air filter and the engine, then check the sensor plug.",
      "soon",
    ),
  );

airFlow("P0100", "circuit", "Problem with the air flow sensor", "The sensor that measures air going into the engine isn't giving a sensible signal. The engine may run rough or feel weak.");
airFlow("P0101", "range", "Air flow sensor reading doesn't make sense", "The air flow sensor works but its readings don't match how the engine is running. Often just dirt on the sensor.");
airFlow("P0102", "low", "Air flow sensor reads too low", "The air flow sensor reports less air than the engine must be getting. The engine may hesitate or stall.");
airFlow("P0103", "high", "Air flow sensor reads too high", "The air flow sensor reports more air than is possible. The engine may run rich and use more fuel.");
airFlow("P0104", "intermittent", "Air flow sensor signal comes and goes", "The air flow sensor's signal keeps dropping out. The engine may stumble now and then.");

const intakePressure = (code: string, kind: Kind, title: string, plain: string) =>
  add(
    code,
    `Manifold absolute pressure/barometric pressure ${OFFICIAL_KIND[kind]}`,
    say(
      title,
      plain,
      ["Split or blocked hose to the sensor", "Damaged sensor plug or wiring", "Failed intake pressure sensor", "Air leak in the intake"],
      "Find the pressure sensor on the intake and check its hose and plug.",
      "soon",
    ),
  );

intakePressure("P0105", "circuit", "Problem with the intake pressure sensor", "The sensor that measures pressure in the intake isn't giving a sensible signal. The engine may run rough, feel weak or use more fuel.");
intakePressure("P0106", "range", "Intake pressure reading doesn't make sense", "The intake pressure sensor works but its readings don't match how the engine is running. Often a split hose.");
intakePressure("P0107", "low", "Intake pressure sensor reads too low", "The sensor reports less pressure in the intake than is possible. The engine may hesitate or stall.");
intakePressure("P0108", "high", "Intake pressure sensor reads too high", "The sensor reports more pressure in the intake than is possible. The engine may run rich and smoke.");

const airTemp = (code: string, kind: Kind, title: string, plain: string) =>
  add(
    code,
    `Intake air temperature ${OFFICIAL_KIND[kind]}`,
    say(
      title,
      plain,
      ["Damaged sensor plug or wiring", "Failed sensor (often built into the air flow sensor)"],
      "Check the plug on the sensor, which is often part of the air flow sensor.",
      "ok",
    ),
  );

airTemp("P0110", "circuit", "Problem with the intake air temperature sensor", "The sensor that measures the temperature of incoming air is giving a bad signal. Usually only small effects on running and fuel use.");
airTemp("P0111", "range", "Intake air temperature doesn't make sense", "The air temperature reading doesn't change the way it should. Usually only small effects on running and fuel use.");
airTemp("P0112", "low", "Intake air temperature reads far too hot", "The sensor says the incoming air is hotter than it can be, usually a short in the wiring. Small effects on running.");
airTemp("P0113", "high", "Intake air temperature reads far too cold", "The sensor says the incoming air is colder than it can be, usually an unplugged or broken sensor. Small effects on running.");

const coolantTemp = (code: string, kind: Kind, title: string, plain: string) =>
  add(
    code,
    `Engine coolant temperature ${OFFICIAL_KIND[kind]}`,
    say(
      title,
      plain,
      ["Failed coolant temperature sensor", "Damaged sensor plug or wiring", "Low coolant level"],
      "Check the coolant level first (engine cold), then the sensor plug.",
      "soon",
    ),
  );

coolantTemp("P0115", "circuit", "Problem with the engine temperature sensor", "The engine doesn't know how warm it is. It may start badly, idle oddly, or the cooling fan may run all the time.");
coolantTemp("P0116", "range", "Engine temperature reading doesn't make sense", "The temperature reading doesn't rise the way a warming engine should. It may start badly or use more fuel.");
coolantTemp("P0117", "low", "Engine temperature reads far too hot", "The sensor says the engine is hotter than it can be, usually a short in the wiring. Check the real gauge: if it is normal, it's the sensor.");
coolantTemp("P0118", "high", "Engine temperature reads far too cold", "The sensor says the engine is colder than it can be, usually an unplugged or broken sensor. Hard starting and high fuel use.");

const throttle = (code: string, sensor: "A" | "B", kind: Kind, title: string) =>
  add(
    code,
    `Throttle/pedal position sensor ${sensor} ${OFFICIAL_KIND[kind]}`,
    say(
      title,
      "The engine can't tell how far the throttle is open. It may hesitate, idle badly or go into a reduced-power mode.",
      ["Worn throttle position sensor", "Dirty throttle body", "Damaged plug or wiring"],
      "Check the plug on the throttle body and clean the throttle if it is dirty.",
      "soon",
    ),
  );

throttle("P0120", "A", "circuit", "Problem with the throttle position sensor");
throttle("P0121", "A", "range", "Throttle position reading doesn't make sense");
throttle("P0122", "A", "low", "Throttle position sensor reads too low");
throttle("P0123", "A", "high", "Throttle position sensor reads too high");

add(
  "P0125",
  "Insufficient coolant temperature for closed loop fuel control",
  say(
    "Engine is taking too long to warm up",
    "The engine stays cold longer than it should, so it keeps running on its cold-start fuel setting. More fuel used and a weak heater.",
    ["Thermostat stuck open", "Faulty coolant temperature sensor", "Low coolant level"],
    "Watch the temperature gauge on a drive. If it never reaches the middle, the thermostat is stuck open.",
    "soon",
  ),
);
add(
  "P0128",
  "Coolant thermostat (coolant temperature below thermostat regulating temperature)",
  say(
    "Engine isn't reaching its normal temperature",
    "The engine runs cooler than it should, nearly always because the thermostat is stuck open. More fuel used, more wear, and a weak heater in winter.",
    ["Thermostat stuck open", "Faulty coolant temperature sensor", "Low coolant level"],
    "Watch the temperature gauge on a drive. If it stays low or drops on the motorway, replace the thermostat.",
    "soon",
  ),
);

o2Set(130, { bank: 1, sensor: 1 });
o2Set(136, { bank: 1, sensor: 2 });
o2Set(150, { bank: 2, sensor: 1 });
o2Set(156, { bank: 2, sensor: 2 });

// ---------------------------------------------------------------------------------------------
// P017x to P019x: fuel mixture and fuel pressure sensor
// ---------------------------------------------------------------------------------------------

const second = " on the second row of cylinders (V engines)";

const lean = (code: string, official: string, bank: string, when = "") =>
  add(
    code,
    official,
    say(
      "Engine is getting too much air or too little fuel",
      `The engine has to add a lot of extra fuel to run right${when}${bank}. Usually an air leak. It can run rough and use more fuel.`,
      ["Cracked or loose vacuum hose", "Dirty air flow sensor", "Weak fuel pump or clogged fuel filter", "Leaking intake gasket"],
      "With the engine idling, listen for hissing around the intake and look for split rubber hoses.",
      "soon",
    ),
  );

const rich = (code: string, official: string, bank: string, when = "") =>
  add(
    code,
    official,
    say(
      "Engine is getting too much fuel",
      `The engine is running with more fuel than it needs${when}${bank}. It wastes fuel and can damage the catalytic converter over time.`,
      ["Leaking injector", "Faulty coolant temperature sensor", "Dirty air flow sensor", "Fuel pressure too high"],
      "Check the coolant temperature on the dashboard: a sensor stuck reading cold makes the engine run rich.",
      "soon",
    ),
  );

const mixture = (code: string, bank: 1 | 2) =>
  add(
    code,
    `Fuel trim, bank ${bank}`,
    say(
      "Fuel mixture is off",
      `The engine can't keep the mix of air and fuel right${bank === 2 ? second : ""}. It may run rough and use more fuel.`,
      ["Air leak in the intake", "Dirty air flow sensor", "Leaking or clogged injector", "Wrong fuel pressure"],
      "With the engine idling, listen for hissing around the intake and look for split rubber hoses.",
      "soon",
    ),
  );

mixture("P0170", 1);
lean("P0171", "System too lean, bank 1", "");
rich("P0172", "System too rich, bank 1", "");
mixture("P0173", 2);
lean("P0174", "System too lean, bank 2", second);
rich("P0175", "System too rich, bank 2", second);

add(
  "P0180",
  "Fuel temperature sensor A circuit",
  say(
    "Problem with the fuel temperature sensor",
    "The sensor that measures fuel temperature is giving a bad signal. Mostly seen on diesels. Usually small effects, sometimes less power.",
    ["Damaged sensor plug or wiring", "Failed fuel temperature sensor"],
    "Check the plug on the sensor, on the fuel rail, pump or filter housing.",
    "ok",
  ),
);

const railSensor = (code: string, kind: Kind, title: string) =>
  add(
    code,
    `Fuel rail pressure sensor ${OFFICIAL_KIND[kind]}`,
    say(
      title,
      "The engine can't trust its fuel pressure reading. It may be hard to start, lose power or cut out.",
      ["Damaged sensor plug or wiring", "Failed fuel pressure sensor", "Real fuel pressure fault (filter or pump)"],
      "Check the plug on the pressure sensor on the fuel rail. Change the fuel filter if it is due.",
      "soon",
    ),
  );

railSensor("P0190", "circuit", "Problem with the fuel pressure sensor");
railSensor("P0191", "range", "Fuel pressure reading doesn't make sense");
railSensor("P0192", "low", "Fuel pressure sensor reads too low");
railSensor("P0193", "high", "Fuel pressure sensor reads too high");

// ---------------------------------------------------------------------------------------------
// P02xx: injectors, overheating, pedal, fuel pump, turbo
// ---------------------------------------------------------------------------------------------

const injector = (code: string, cyl?: number) =>
  add(
    code,
    cyl ? `Injector circuit, cylinder ${cyl}` : "Injector circuit",
    say(
      cyl ? `Electrical fault on the cylinder ${cyl} injector` : "Electrical fault on a fuel injector",
      `The engine computer can't switch ${cyl ? `the injector for cylinder ${cyl}` : "one of the injectors"} properly. That cylinder misfires, so the engine shakes and loses power.`,
      ["Loose or corroded injector plug", "Chafed injector wiring", "Failed injector"],
      cyl
        ? `Check the plug on the cylinder ${cyl} injector. Swap the injector with a neighbour: if the fault moves, the injector is bad.`
        : "Check that every injector plug is pushed fully home and the wiring isn't chafed.",
      "soon",
    ),
  );

injector("P0200");
for (let cyl = 1; cyl <= 8; cyl++) injector(`P020${cyl}`, cyl);

add(
  "P0217",
  "Engine overtemperature condition",
  say(
    "The engine has overheated",
    "The engine got hotter than is safe. Driving an overheating engine can blow the head gasket or warp the cylinder head.",
    ["Low coolant from a leak", "Thermostat stuck closed", "Cooling fan not working", "Failed water pump"],
    "Stop and let it cool fully. Then check the coolant level and look for leaks. Never open a hot radiator cap.",
    "now",
  ),
);
add(
  "P0219",
  "Engine overspeed condition",
  say(
    "The engine was revved too high",
    "The engine went past its rev limit, usually from a missed gear change down. If it runs normally now, it is often just a record of that moment.",
    ["Changing down into too low a gear", "Faulty engine speed sensor"],
    "If the engine sounds and pulls as usual, clear the code and see if it comes back.",
    "ok",
  ),
);

const pedal = (code: string, official: string, title: string) =>
  add(
    code,
    official,
    say(
      title,
      "The accelerator pedal or throttle has two sensors that must agree. One is giving a bad signal, so the car limits power to stay safe.",
      ["Worn accelerator pedal sensor", "Damaged plug or wiring", "Worn throttle body"],
      "Check the plug on top of the accelerator pedal and on the throttle body.",
      "soon",
    ),
  );

pedal("P0220", "Throttle/pedal position sensor B circuit", "Problem with the second throttle position sensor");
pedal("P0221", "Throttle/pedal position sensor B range/performance", "Second throttle sensor reading doesn't make sense");
pedal("P0222", "Throttle/pedal position sensor B circuit low", "Second throttle position sensor reads too low");
pedal("P0223", "Throttle/pedal position sensor B circuit high", "Second throttle position sensor reads too high");

add(
  "P0230",
  "Fuel pump primary circuit",
  say(
    "Electrical fault on the fuel pump",
    "The fuel pump isn't getting power the way it should. The engine may not start, or may cut out while driving.",
    ["Blown fuel pump fuse", "Faulty fuel pump relay", "Damaged wiring to the pump", "Failed fuel pump"],
    "Turn the ignition on and listen for the pump humming at the tank for a second or two. Check its fuse and relay.",
    "now",
  ),
);

add(
  "P0234",
  "Turbocharger/supercharger overboost condition",
  say(
    "Turbo is making too much pressure",
    "The turbo is pushing more air into the engine than it should. The car usually cuts power to protect itself. Too much boost can damage the engine.",
    ["Sticking turbo vanes or wastegate", "Split or disconnected boost control hose", "Faulty boost control valve", "Faulty boost pressure sensor"],
    "Check the thin vacuum hoses to the turbo's actuator for splits, and that the actuator rod moves freely.",
    "soon",
  ),
);

const boostSensor = (code: string, kind: Kind, title: string) =>
  add(
    code,
    `Turbocharger/supercharger boost sensor A ${OFFICIAL_KIND[kind]}`,
    say(
      title,
      "The engine can't trust its turbo pressure reading. It usually limits power to stay safe.",
      ["Damaged sensor plug or wiring", "Sensor clogged with oil or soot", "Split boost hose", "Failed boost pressure sensor"],
      "Find the boost pressure sensor on the intake, check its plug, and clean it if it is oily.",
      "soon",
    ),
  );

boostSensor("P0235", "circuit", "Problem with the turbo pressure sensor");
boostSensor("P0236", "range", "Turbo pressure reading doesn't make sense");
boostSensor("P0237", "low", "Turbo pressure sensor reads too low");
boostSensor("P0238", "high", "Turbo pressure sensor reads too high");

add(
  "P0243",
  "Turbocharger/supercharger wastegate solenoid A",
  say(
    "Problem with the turbo's boost control valve",
    "The valve that controls how much pressure the turbo makes isn't responding. Power may be low or come in surges.",
    ["Damaged plug or wiring to the valve", "Failed boost control valve", "Split vacuum hose"],
    "Check the plug and the thin hoses on the boost control valve.",
    "soon",
  ),
);
add(
  "P0299",
  "Turbocharger/supercharger underboost condition",
  say(
    "Turbo isn't making enough pressure",
    "The turbo is pushing less air than the engine asked for. The car feels slow, especially uphill, and may smoke.",
    ["Split or loose boost hose", "Sticking turbo vanes or wastegate", "Leaking intercooler", "Worn turbo"],
    "Check the big hoses between the turbo, intercooler and engine for splits, oil mist and loose clamps.",
    "soon",
  ),
);

// ---------------------------------------------------------------------------------------------
// P03xx: misfires, knock, crank and cam sensors, ignition coils, glow plugs
// ---------------------------------------------------------------------------------------------

const misfire = (code: string, cyl?: number) =>
  add(
    code,
    cyl ? `Cylinder ${cyl} misfire` : "Random or multiple cylinder misfire",
    say(
      cyl ? `Cylinder ${cyl} isn't firing properly` : "The engine is misfiring",
      (cyl ? `Cylinder ${cyl} isn't burning its fuel properly. ` : "One or more cylinders aren't burning their fuel properly. ") +
        "Unburnt fuel can overheat and ruin the catalytic converter. If the engine light flashes, stop driving.",
      cyl
        ? [`Worn spark plug in cylinder ${cyl}`, `Faulty ignition coil or plug lead for cylinder ${cyl}`, "Leaking injector", "Low compression"]
        : ["Worn spark plugs", "Faulty ignition coils or plug leads", "Air leak in the intake", "Low fuel pressure"],
      cyl
        ? `Swap the ignition coil of cylinder ${cyl} with a neighbour. If the misfire moves, the coil is bad.`
        : "Check the spark plugs and plug leads first: they are cheap and the most common cause.",
      "now",
    ),
  );

misfire("P0300");
for (let cyl = 1; cyl <= 12; cyl++) misfire(`P03${String(cyl).padStart(2, "0")}`, cyl);

add(
  "P0313",
  "Misfire detected with low fuel",
  say(
    "The engine misfired while nearly out of fuel",
    "The engine stumbled when the tank was almost empty. Most likely it just sucked air. Fill up and see if it returns.",
    ["Running the tank nearly empty", "Faulty fuel level sensor", "Weak fuel pump"],
    "Fill the tank, clear the code and drive. If it comes back with fuel in the tank, treat it as a misfire.",
    "ok",
  ),
);
add(
  "P0315",
  "Crankshaft position system variation not learned",
  say(
    "The engine computer needs to relearn the crankshaft",
    "After some repairs or a battery change, the computer must relearn the crankshaft's signal to spot misfires. It hasn't done so yet. No harm to the engine.",
    ["Recent crankshaft sensor, engine or computer work", "Battery was disconnected"],
    "A workshop tool runs the relearn in a few minutes. Some cars relearn by themselves after a few drives.",
    "ok",
  ),
);
add(
  "P0320",
  "Ignition/distributor engine speed input circuit",
  say(
    "Problem with the engine speed signal",
    "The engine computer is losing the signal that tells it how fast the engine turns. It may cut out or refuse to start.",
    ["Failed crankshaft or distributor sensor", "Damaged wiring or plug", "Faulty ignition module"],
    "Check the plug and wiring on the crankshaft sensor.",
    "now",
  ),
);

const knock = (code: string, official: string, title: string) =>
  add(
    code,
    official,
    say(
      title,
      "The sensor that listens for harmful engine knock isn't working. The engine plays safe and may feel a bit weaker.",
      ["Damaged sensor wiring", "Failed knock sensor", "Loose sensor"],
      "Check the sensor's plug and wiring, which often run under the intake.",
      "soon",
    ),
  );

knock("P0325", "Knock sensor 1 circuit", "Problem with the knock sensor");
knock("P0326", "Knock sensor 1 range/performance", "Knock sensor reading doesn't make sense");
knock("P0327", "Knock sensor 1 circuit low", "Knock sensor reads too low");
knock("P0328", "Knock sensor 1 circuit high", "Knock sensor reads too high");
knock("P0330", "Knock sensor 2 circuit", "Problem with the second knock sensor");

const crank = (code: string, kind: Kind, title: string) =>
  add(
    code,
    `Crankshaft position sensor A ${OFFICIAL_KIND[kind]}`,
    say(
      title,
      "The engine can't reliably tell where the crankshaft is. It may cut out or refuse to start.",
      ["Failed crankshaft sensor", "Damaged wiring", "Dirt or metal on the sensor tip"],
      "Check the sensor plug and wiring near the flywheel or crank pulley.",
      "now",
    ),
  );

crank("P0335", "circuit", "Problem with the crankshaft position sensor");
crank("P0336", "range", "Crankshaft sensor signal doesn't make sense");
crank("P0337", "low", "Crankshaft sensor signal is too weak");
crank("P0338", "high", "Crankshaft sensor signal is too strong");
crank("P0339", "intermittent", "Crankshaft sensor signal comes and goes");

const cam = (code: string, official: string, title: string) =>
  add(
    code,
    official,
    say(
      title,
      "The engine can't tell where the camshaft is. It may start slowly, run rough or stall.",
      ["Failed camshaft sensor", "Damaged wiring", "Stretched timing chain or belt"],
      "Check the sensor plug and wiring on the cylinder head.",
      "soon",
    ),
  );

cam("P0340", "Camshaft position sensor A circuit, bank 1", "Problem with the camshaft position sensor");
cam("P0341", "Camshaft position sensor A range/performance, bank 1", "Camshaft sensor signal doesn't make sense");
cam("P0342", "Camshaft position sensor A circuit low, bank 1", "Camshaft sensor signal is too weak");
cam("P0343", "Camshaft position sensor A circuit high, bank 1", "Camshaft sensor signal is too strong");
cam("P0344", "Camshaft position sensor A circuit intermittent, bank 1", "Camshaft sensor signal comes and goes");
cam("P0345", "Camshaft position sensor A circuit, bank 2", "Problem with the second camshaft position sensor");

const coil = (code: string, letter?: string, cyl?: number) =>
  add(
    code,
    letter ? `Ignition coil ${letter} primary/secondary circuit` : "Ignition coil primary/secondary circuit",
    say(
      cyl ? `Electrical fault on ignition coil ${cyl}` : "Electrical fault on an ignition coil",
      `${cyl ? `Ignition coil ${cyl} (usually cylinder ${cyl})` : "One of the ignition coils"} isn't being driven properly, so that cylinder gets no spark. The engine shakes, and unburnt fuel can ruin the catalytic converter.`,
      ["Failed ignition coil", "Loose or corroded coil plug", "Damaged wiring to the coil"],
      cyl
        ? `Check the plug on coil ${cyl}, then swap the coil with a neighbour. If the fault moves, the coil is bad.`
        : "Check that every coil plug is pushed fully home.",
      "now",
    ),
  );

coil("P0350");
"ABCDEFGH".split("").forEach((letter, i) => coil(`P035${i + 1}`, letter, i + 1));

add(
  "P0380",
  "Glow plug/heater circuit A",
  say(
    "Problem with the glow plugs",
    "The plugs that warm a diesel's cylinders before a cold start aren't working properly. Hard cold starts and white smoke, mostly in winter.",
    ["Burnt-out glow plug", "Faulty glow plug relay or control unit", "Blown fuse or damaged wiring"],
    "Check the glow plug fuse and relay. A workshop can test each plug in minutes.",
    "soon",
  ),
);
add(
  "P0381",
  "Glow plug/heater indicator circuit",
  say(
    "Problem with the glow plug warning light",
    "The dashboard light that tells you to wait before starting a cold diesel isn't working right. The glow plugs themselves may be fine.",
    ["Blown bulb or instrument fault", "Damaged wiring", "Faulty glow plug control unit"],
    "Turn the ignition on from cold and see whether the coil-shaped light comes on.",
    "ok",
  ),
);

// ---------------------------------------------------------------------------------------------
// P04xx: exhaust gas recirculation, secondary air, catalyst, fuel vapour, fuel level, fans
// ---------------------------------------------------------------------------------------------

const egr = (code: string, official: string, title: string, plain: string) =>
  add(
    code,
    official,
    say(
      title,
      plain,
      ["Carbon build-up in the EGR valve or passages", "Stuck EGR valve", "Damaged plug, wiring or vacuum hose to the valve"],
      "Clean the EGR valve and its passages, and check its plug or vacuum hose.",
      "soon",
    ),
  );

const egrWhat = "The system that feeds some exhaust back into the engine to lower emissions";
egr("P0400", "Exhaust gas recirculation flow", "Exhaust gas recirculation isn't flowing right", `${egrWhat} isn't flowing as it should. Rough idle, less power and failed emissions tests.`);
egr("P0401", "Exhaust gas recirculation flow insufficient", "Exhaust gas recirculation isn't flowing enough", `${egrWhat} is blocked or stuck. It can cause knocking and failed emissions tests.`);
egr("P0402", "Exhaust gas recirculation flow excessive", "Exhaust gas recirculation is flowing too much", `${egrWhat} is letting too much through, often a valve stuck open. Rough idle, stalling and smoke.`);
egr("P0403", "Exhaust gas recirculation control circuit", "Electrical fault on the EGR valve", `${egrWhat} has a valve the computer can't control. Less power and failed emissions tests.`);
egr("P0404", "Exhaust gas recirculation control circuit range/performance", "The EGR valve isn't moving as it should", `${egrWhat} has a valve that sticks. Rough idle, less power and smoke.`);
egr("P0405", "Exhaust gas recirculation sensor A circuit low", "EGR valve position reads too low", `${egrWhat} has a position sensor giving a bad signal. Less power and failed emissions tests.`);
egr("P0406", "Exhaust gas recirculation sensor A circuit high", "EGR valve position reads too high", `${egrWhat} has a position sensor giving a bad signal. Less power and failed emissions tests.`);

const secondaryAir = (code: string, official: string, title: string) =>
  add(
    code,
    official,
    say(
      title,
      "For a minute after a cold start, a small pump blows fresh air into the exhaust to clean it up faster. It isn't working. No effect on driving.",
      ["Failed secondary air pump", "Blown pump fuse or faulty relay", "Stuck or leaking air valve", "Split air hose"],
      "At a cold start, listen for the pump (like a small vacuum cleaner) running for about a minute.",
      "ok",
    ),
  );

secondaryAir("P0410", "Secondary air injection system", "Problem with the cold-start air pump");
secondaryAir("P0411", "Secondary air injection system incorrect flow", "Cold-start air pump isn't blowing enough air");

const catalyst = (code: string, official: string, bank: string) =>
  add(
    code,
    official,
    say(
      "Catalytic converter isn't cleaning the exhaust well enough",
      `The exhaust cleaner${bank} has worn out or a sensor thinks it has. The car drives fine but will likely fail an emissions test.`,
      ["Worn-out catalytic converter", "Faulty oxygen sensor after the converter", "Exhaust leak near the sensors", "Old misfires that damaged the converter"],
      "Fix any misfire codes first, then check for exhaust leaks before replacing the converter.",
      "ok",
    ),
  );

catalyst("P0420", "Catalyst efficiency below threshold, bank 1", "");
catalyst("P0421", "Warm up catalyst efficiency below threshold, bank 1", " nearest the engine");
catalyst("P0430", "Catalyst efficiency below threshold, bank 2", " on the second row of cylinders");
catalyst("P0431", "Warm up catalyst efficiency below threshold, bank 2", " nearest the engine, on the second row of cylinders");

const vapour = (code: string, official: string, title: string, plain: string, causes: string[], check: string) =>
  add(code, official, say(title, plain, causes, check, "ok"));

const vapourWhat = "The system that catches fuel vapour from the tank";
const capCheck = "Tighten the fuel cap until it clicks, or replace a cap with a cracked seal.";
vapour("P0440", "Evaporative emission system", "Problem with the fuel vapour system", `${vapourWhat} isn't working right. No effect on driving, but it can fail an emissions test.`, ["Loose or worn fuel cap", "Cracked vapour hose", "Faulty purge valve"], capCheck);
vapour("P0441", "Evaporative emission system incorrect purge flow", "Fuel vapour isn't being drawn into the engine properly", `${vapourWhat} should feed it to the engine to be burnt. That flow is wrong. Sometimes a rough idle or hard starting after filling up.`, ["Faulty purge valve", "Cracked or disconnected vapour hose", "Loose fuel cap"], "Find the purge valve near the intake and check its hoses and plug.");
vapour("P0442", "Evaporative emission system small leak", "Small leak in the fuel vapour system", "Fuel vapour is escaping somewhere, often from the fuel cap. No effect on driving, but it can fail an emissions test.", ["Loose or worn fuel cap", "Cracked vapour hose", "Faulty purge valve"], capCheck);
vapour("P0443", "Evaporative emission system purge control valve circuit", "Electrical fault on the fuel vapour purge valve", `${vapourWhat} has a valve the computer can't switch. No effect on driving in most cars.`, ["Failed purge valve", "Damaged plug or wiring"], "Find the purge valve near the intake and check its plug.");
vapour("P0446", "Evaporative emission system vent control circuit", "Problem with the fuel vapour vent valve", `${vapourWhat} has a vent valve that isn't working. No effect on driving. The pump may click off early when you fill up.`, ["Vent valve clogged with dirt", "Failed vent valve", "Damaged plug or wiring"], "The vent valve sits near the tank or charcoal canister. Check it for dirt and a loose plug.");
vapour("P0449", "Evaporative emission system vent valve/solenoid circuit", "Electrical fault on the fuel vapour vent valve", `${vapourWhat} has a vent valve the computer can't switch. No effect on driving.`, ["Failed vent valve", "Corroded plug or wiring near the tank"], "The vent valve sits near the tank or charcoal canister. Check its plug for corrosion.");
vapour("P0455", "Evaporative emission system large leak", "Large leak in the fuel vapour system", "A lot of fuel vapour is escaping, very often because the fuel cap is missing or not closed. No effect on driving.", ["Fuel cap missing or not closed", "Disconnected vapour hose", "Faulty purge or vent valve"], "Make sure the fuel cap is on and closed properly.");
vapour("P0456", "Evaporative emission system very small leak", "Tiny leak in the fuel vapour system", "A very small amount of fuel vapour is escaping, often past the fuel cap seal. No effect on driving.", ["Worn fuel cap seal", "Tiny crack in a vapour hose", "Leaking purge or vent valve"], capCheck);
vapour("P0457", "Evaporative emission system leak detected (fuel cap loose/off)", "The fuel cap is loose or missing", "The car noticed a vapour leak right after filling up. Almost always the fuel cap. No effect on driving.", ["Fuel cap not tightened", "Worn fuel cap seal"], "Tighten the fuel cap until it clicks. The light can take a few days of driving to go out.");

const tankPressure = (code: string, official: string, title: string) =>
  vapour(code, official, title, "The sensor that checks the fuel tank for vapour leaks is giving a bad signal. No effect on driving.", ["Failed tank pressure sensor", "Damaged plug or wiring near the tank", "Blocked vapour hose"], "Check the wiring and plug on top of the fuel tank or charcoal canister.");

tankPressure("P0450", "Evaporative emission system pressure sensor", "Problem with the fuel tank pressure sensor");
tankPressure("P0451", "Evaporative emission system pressure sensor range/performance", "Fuel tank pressure reading doesn't make sense");
tankPressure("P0452", "Evaporative emission system pressure sensor low", "Fuel tank pressure sensor reads too low");
tankPressure("P0453", "Evaporative emission system pressure sensor high", "Fuel tank pressure sensor reads too high");

const fuelLevel = (code: string, kind: Kind, title: string) =>
  add(
    code,
    `Fuel level sensor ${OFFICIAL_KIND[kind]}`,
    say(
      title,
      "The fuel gauge can't be trusted. The engine is fine, but you could run out of fuel without warning.",
      ["Worn fuel level sender in the tank", "Corroded plug or wiring at the tank", "Faulty instrument cluster"],
      "Fill the tank and see if the gauge reads full. Keep track of distance until it is fixed.",
      "ok",
    ),
  );

fuelLevel("P0460", "circuit", "Problem with the fuel level sensor");
fuelLevel("P0461", "range", "Fuel level reading doesn't make sense");
fuelLevel("P0462", "low", "Fuel level sensor reads too low");
fuelLevel("P0463", "high", "Fuel level sensor reads too high");

const fan = (code: string, n: number) =>
  add(
    code,
    `Cooling fan ${n} control circuit`,
    say(
      n === 1 ? "Electrical fault on the cooling fan" : "Electrical fault on the second cooling fan",
      "The engine computer can't switch the radiator fan properly. The engine can overheat in traffic or on hot days.",
      ["Blown fan fuse", "Faulty fan relay", "Failed fan motor", "Damaged wiring"],
      "Check the fan fuse and relay. Watch the temperature gauge in traffic until it is fixed.",
      "soon",
    ),
  );

fan("P0480", 1);
fan("P0481", 2);

// ---------------------------------------------------------------------------------------------
// P05xx: road speed, idle, oil pressure, air conditioning, voltage, brake switch
// ---------------------------------------------------------------------------------------------

const speed = (code: string, official: string, title: string) =>
  add(
    code,
    official,
    say(
      title,
      "The engine computer isn't getting a good speed signal. The speedometer may stop working and automatic gearboxes may shift oddly.",
      ["Failed speed sensor", "Damaged wiring", "Faulty ABS sensor on cars that share the signal"],
      "Check whether the speedometer works. Then check the speed sensor plug on the gearbox.",
      "soon",
    ),
  );

speed("P0500", "Vehicle speed sensor A", "Problem with the road speed signal");
speed("P0501", "Vehicle speed sensor A range/performance", "Road speed signal doesn't make sense");
speed("P0502", "Vehicle speed sensor A circuit low input", "Road speed signal is too weak");
speed("P0503", "Vehicle speed sensor A intermittent/erratic/high", "Road speed signal jumps around");

const idle = (code: string, official: string, title: string, plain: string) =>
  add(
    code,
    official,
    say(
      title,
      plain,
      ["Dirty throttle body or idle valve", "Air leak in the intake", "Failed idle control valve"],
      "Clean the throttle body and idle valve, and look for split vacuum hoses.",
      "soon",
    ),
  );

idle("P0505", "Idle air control system", "Idle speed isn't being controlled properly", "The engine struggles to keep a steady idle. It may idle too high, too low, or stall when you stop.");
idle("P0506", "Idle air control system RPM lower than expected", "The engine idles too slowly", "The engine idles lower than it should and may shake or stall when you stop.");
idle("P0507", "Idle air control system RPM higher than expected", "The engine idles too fast", "The engine idles higher than it should, usually from air sneaking in past the throttle. More fuel used and harder to brake smoothly.");

const oilPressure = (code: string, official: string, title: string) =>
  add(
    code,
    official,
    say(
      title,
      "The oil pressure reading is wrong or really is low. Real low oil pressure destroys an engine in minutes, so treat it as real until proven otherwise.",
      ["Low engine oil", "Failed oil pressure sensor", "Damaged sensor wiring", "Worn oil pump or blocked oil pickup"],
      "Stop and check the oil level with the dipstick. If the red oil light is on or the engine rattles, don't run it.",
      "now",
    ),
  );

oilPressure("P0520", "Engine oil pressure sensor/switch circuit", "Problem with the oil pressure sensor");
oilPressure("P0521", "Engine oil pressure sensor/switch range/performance", "Oil pressure reading doesn't make sense");
oilPressure("P0522", "Engine oil pressure sensor/switch low", "Oil pressure reads too low");
oilPressure("P0523", "Engine oil pressure sensor/switch high", "Oil pressure reads too high");

add(
  "P0530",
  "A/C refrigerant pressure sensor A circuit",
  say(
    "Problem with the air conditioning pressure sensor",
    "The car can't read the pressure in the air conditioning, so it keeps the A/C switched off. The engine is fine.",
    ["Damaged sensor plug or wiring", "Failed pressure sensor", "Air conditioning has lost its gas"],
    "Check the plug on the sensor in the air conditioning pipe near the radiator.",
    "ok",
  ),
);

add(
  "P0560",
  "System voltage",
  say(
    "Battery voltage is unstable",
    "The electrical system voltage isn't steady. The car may struggle to start, and other false fault codes may appear.",
    ["Weak or old battery", "Corroded or loose battery terminals", "Failing alternator", "Bad earth connection"],
    "Check the Battery or Module voltage reading with the engine running: about 13.5 to 14.5 V is normal.",
    "soon",
  ),
);
add(
  "P0562",
  "System voltage low",
  say(
    "Battery voltage is low",
    "The electrical system voltage is too low. The car may struggle to start or other faults may appear.",
    ["Weak or old battery", "Failing alternator", "Corroded battery terminals"],
    "Check the Battery or Module voltage reading with the engine running: about 13.5 to 14.5 V is normal.",
    "soon",
  ),
);
add(
  "P0563",
  "System voltage high",
  say(
    "Battery voltage is too high",
    "The charging system is putting out too much voltage, which can damage the battery and electronics.",
    ["Faulty voltage regulator in the alternator", "Bad earth connection"],
    "Check the voltage reading with the engine running: above about 15 V is too high.",
    "now",
  ),
);
add(
  "P0571",
  "Brake switch A circuit",
  say(
    "Problem with the brake pedal switch",
    "The car can't tell reliably when you press the brake. Cruise control stops working, and the brake lights may not work either.",
    ["Worn or misadjusted brake pedal switch", "Blown brake light fuse", "Damaged wiring"],
    "Have someone check that the brake lights come on when you press the pedal. If not, fix it before driving.",
    "soon",
  ),
);

// ---------------------------------------------------------------------------------------------
// P06xx: the engine computer itself
// ---------------------------------------------------------------------------------------------

const computer = (code: string, official: string) =>
  add(
    code,
    official,
    say(
      "The engine computer reports a fault in itself",
      "The engine computer failed one of its own self-checks. Often caused by low battery voltage or a bad connection, sometimes a failing computer.",
      ["Weak battery or poor battery connections", "Bad earth connection to the computer", "Water in the computer or its plug", "Failing engine computer"],
      "Check the battery, its terminals and the earth straps first. Clear the code and see if it returns.",
      "soon",
    ),
  );

computer("P0600", "Serial communication link");
computer("P0601", "Internal control module memory check sum error");
computer("P0602", "Control module programming error");
computer("P0603", "Internal control module keep alive memory (KAM) error");
computer("P0604", "Internal control module random access memory (RAM) error");
computer("P0605", "Internal control module read only memory (ROM) error");
computer("P0606", "Control module processor");

add(
  "P0620",
  "Generator control circuit",
  say(
    "Problem with alternator control",
    "The engine computer can't control the alternator's charging. The battery may go flat or be overcharged.",
    ["Damaged plug or wiring on the alternator", "Failing alternator", "Loose or worn drive belt"],
    "Check the voltage reading with the engine running: about 13.5 to 14.5 V is normal.",
    "soon",
  ),
);
add(
  "P0627",
  "Fuel pump A control circuit/open",
  say(
    "Electrical fault on the fuel pump control",
    "The engine computer can't switch the fuel pump properly. The engine may not start, or may cut out while driving.",
    ["Faulty fuel pump relay or control unit", "Blown fuse", "Damaged wiring to the pump", "Failed fuel pump"],
    "Turn the ignition on and listen for the pump humming at the tank. Check its fuse and relay.",
    "now",
  ),
);

const reference = (code: string, letter: string) =>
  add(
    code,
    `Sensor reference voltage ${letter} circuit/open`,
    say(
      "A group of sensors has lost its power supply",
      "The engine computer feeds several sensors from one 5 volt supply, and that supply has dropped out. Expect other sensor codes with it. The engine may run badly or not start.",
      ["One shorted sensor pulling the supply down", "Chafed wiring shorting to the body", "Failing engine computer"],
      "Unplug the sensors named in the other fault codes one at a time. If the faults go away, the last one unplugged is bad.",
      "soon",
    ),
  );

reference("P0641", "A");
reference("P0651", "B");

add(
  "P0650",
  "Malfunction indicator lamp (MIL) control circuit",
  say(
    "Problem with the engine warning light itself",
    "The engine computer can't switch the engine warning light on the dashboard. The engine may be fine, but you wouldn't be warned of new faults.",
    ["Blown bulb or instrument cluster fault", "Damaged wiring to the instrument cluster"],
    "Turn the ignition on without starting: the engine light should come on for a moment.",
    "soon",
  ),
);

// ---------------------------------------------------------------------------------------------
// P07xx: automatic gearbox
// ---------------------------------------------------------------------------------------------

const gearbox = (code: string, official: string, title: string, plain: string, causes: string[], urgency: Urgency = "soon") =>
  add(code, official, say(title, plain, causes, "Check the gearbox fluid level and condition if your car has a dipstick. Dark or burnt-smelling fluid needs a workshop.", urgency));

gearbox("P0700", "Transmission control system (MIL request)", "The gearbox computer has a fault stored", "The automatic gearbox has its own computer, and it asked for the engine light. This code only says so. The real fault code is stored in the gearbox computer.", ["A fault stored in the gearbox computer", "Low or old gearbox fluid"]);
gearbox("P0705", "Transmission range sensor A circuit (PRNDL input)", "The car can't tell which gear position is selected", "The switch that reports Park, Reverse, Neutral and Drive is giving a bad signal. The car may not start, or the reversing lights may not work.", ["Worn or misadjusted gear selector switch", "Damaged plug or wiring on the gearbox", "Stretched selector cable"]);
gearbox("P0710", "Transmission fluid temperature sensor A circuit", "Problem with the gearbox fluid temperature sensor", "The gearbox can't tell how warm its fluid is. Shifts may feel harsh or late.", ["Failed fluid temperature sensor", "Damaged gearbox wiring or plug", "Low gearbox fluid"]);
gearbox("P0715", "Input/turbine speed sensor A circuit", "Problem with a gearbox speed sensor", "The gearbox can't measure how fast its input shaft turns. It may shift harshly or stay in one gear.", ["Failed gearbox speed sensor", "Damaged gearbox wiring or plug", "Low gearbox fluid"]);
gearbox("P0720", "Output speed sensor circuit", "Problem with the gearbox output speed sensor", "The gearbox can't measure how fast its output shaft turns. Shifts may be harsh and the speedometer may misbehave.", ["Failed gearbox speed sensor", "Damaged gearbox wiring or plug", "Metal debris on the sensor tip"]);
gearbox("P0725", "Engine speed input circuit", "The gearbox isn't getting the engine speed", "The gearbox computer has lost the engine speed signal. It may shift harshly or stay in one gear.", ["Faulty crankshaft sensor", "Damaged wiring between engine and gearbox computers"]);

const slip = (code: string, gear?: number) =>
  gearbox(
    code,
    gear ? `Gear ${gear} incorrect ratio` : "Incorrect gear ratio",
    gear ? `The gearbox is slipping in gear ${gear}` : "The gearbox is slipping",
    `${gear ? `In gear ${gear} the` : "The"} engine speed doesn't match the road speed, so something inside is slipping. Driving on wears the gearbox quickly.`,
    ["Low or worn-out gearbox fluid", "Sticking shift valve", "Worn clutch packs inside the gearbox"],
    "now",
  );

slip("P0730");
for (let gear = 1; gear <= 4; gear++) slip(`P073${gear}`, gear);

gearbox("P0740", "Torque converter clutch circuit", "Problem with the gearbox lock-up clutch", "At cruising speed an automatic locks its drive solid to save fuel. That lock-up isn't being controlled properly. More fuel used and a hotter gearbox.", ["Faulty lock-up valve in the gearbox", "Damaged gearbox wiring", "Old gearbox fluid"]);
gearbox("P0741", "Torque converter clutch circuit performance or stuck off", "The gearbox lock-up clutch isn't holding", "At cruising speed an automatic locks its drive solid to save fuel. It isn't locking. More fuel used and a hotter gearbox.", ["Old or low gearbox fluid", "Faulty lock-up valve in the gearbox", "Worn torque converter"]);
gearbox("P0750", "Shift solenoid A", "Problem with a gear shift valve", "One of the electric valves that changes gear isn't working. The gearbox may miss a gear or stay in one gear.", ["Failed shift valve", "Dirty gearbox fluid", "Damaged gearbox wiring"]);
gearbox("P0755", "Shift solenoid B", "Problem with a gear shift valve", "One of the electric valves that changes gear isn't working. The gearbox may miss a gear or stay in one gear.", ["Failed shift valve", "Dirty gearbox fluid", "Damaged gearbox wiring"]);

// ---------------------------------------------------------------------------------------------
// P0Axx and P2xxx: hybrid battery, diesel exhaust treatment, electronic throttle, later mixture codes
// ---------------------------------------------------------------------------------------------

add(
  "P0A80",
  "Replace hybrid battery pack",
  say(
    "The hybrid battery is worn out",
    "Parts of the big hybrid battery have become much weaker than the rest. The car leans more on the petrol engine and may stop driving if it gets worse.",
    ["Aged battery modules", "Blocked battery cooling fan or vent", "Corroded battery connections"],
    "Check that the battery's cooling vent (often by the rear seat) isn't blocked by dust or luggage.",
    "soon",
  ),
);

add(
  "P2002",
  "Particulate filter efficiency below threshold, bank 1",
  say(
    "The diesel soot filter isn't working well enough",
    "The filter that traps soot in the exhaust is blocked, cracked, or a sensor thinks so. A blocked filter chokes the engine and can end in an expensive replacement.",
    ["Filter blocked by many short trips", "Faulty filter pressure sensor or its hoses", "Cracked or removed filter"],
    "Take a 20 to 30 minute motorway drive at steady speed so the filter can burn itself clean.",
    "soon",
  ),
);

const sootSensor = (code: string, official: string, title: string) =>
  add(
    code,
    official,
    say(
      title,
      "The sensor that measures how full the diesel soot filter is isn't giving a good signal. The car can't clean the filter properly without it.",
      ["Split or blocked hoses to the pressure sensor", "Failed pressure sensor", "Damaged plug or wiring"],
      "Find the small sensor with two thin hoses going to the exhaust. Check the hoses for splits and soot blockage.",
      "soon",
    ),
  );

sootSensor("P2452", "Diesel particulate filter pressure sensor A circuit", "Problem with the soot filter pressure sensor");
sootSensor("P2453", "Diesel particulate filter pressure sensor A range/performance", "Soot filter pressure reading doesn't make sense");

add(
  "P2458",
  "Diesel particulate filter regeneration duration",
  say(
    "The soot filter is taking too long to clean itself",
    "The car burns off soot in the filter now and then, and that is taking longer than it should. The filter may be filling up with ash or the burn keeps getting interrupted.",
    ["Many short trips that interrupt the cleaning", "Old filter full of ash", "Faulty exhaust temperature or pressure sensor"],
    "Take a 20 to 30 minute motorway drive at steady speed and don't switch off if the fan is roaring.",
    "soon",
  ),
);
add(
  "P2463",
  "Diesel particulate filter restriction, soot accumulation",
  say(
    "The diesel soot filter is clogging up",
    "Too much soot has built up in the exhaust filter. The car may cut power. If it gets fuller, it can no longer clean itself and needs a workshop.",
    ["Many short trips", "Interrupted cleaning cycles", "Faulty pressure sensor", "Leaking injector or EGR fault making extra soot"],
    "Take a 20 to 30 minute motorway drive at steady speed soon. If power is already cut, go to a workshop.",
    "now",
  ),
);

const adBlue = (code: string, official: string, title: string, plain: string) =>
  add(
    code,
    official,
    say(
      title,
      plain,
      ["Old, diluted or wrong AdBlue", "Crystals blocking the AdBlue injector or lines", "Faulty AdBlue pump or heater", "Faulty NOx sensor"],
      "Check the AdBlue level and top up with fresh fluid. Look for white crystals around the filler and injector.",
      "soon",
    ),
  );

const countdown = "Many cars start a countdown and then refuse to restart, so don't leave it.";
adBlue("P204F", "Reductant system performance, bank 1", "The AdBlue system isn't working properly", `The system that sprays AdBlue into a diesel's exhaust isn't doing its job. ${countdown}`);
adBlue("P20E8", "Reductant pressure too low", "AdBlue pressure is too low", `The pump can't build enough pressure to spray AdBlue into the exhaust. ${countdown}`);
adBlue("P20EE", "SCR NOx catalyst efficiency below threshold, bank 1", "The AdBlue exhaust cleaning isn't working well enough", `The exhaust is dirtier than it should be after AdBlue treatment. ${countdown}`);

lean("P2096", "Post catalyst fuel trim system too lean, bank 1", "", ", measured after the catalytic converter");
rich("P2097", "Post catalyst fuel trim system too rich, bank 1", "", ", measured after the catalytic converter");
lean("P2177", "System too lean off idle, bank 1", "", " when driving");
lean("P2187", "System too lean at idle, bank 1", "", " at idle");
rich("P2188", "System too rich at idle, bank 1", "", " at idle");

const eThrottle = (code: string, official: string, title: string, plain: string, urgency: Urgency = "soon") =>
  add(
    code,
    official,
    say(
      title,
      plain,
      ["Dirty or sticking throttle body", "Damaged throttle plug or wiring", "Failed throttle motor", "Low battery voltage"],
      "Check the plug on the throttle body. Cleaning the throttle body fixes many of these.",
      urgency,
    ),
  );

const byWire = "The throttle is opened by an electric motor, not a cable.";
eThrottle("P2101", "Throttle actuator control motor circuit range/performance", "The electric throttle isn't moving as it should", `${byWire} It isn't reaching the position asked for. Expect reduced power.`);
eThrottle("P2106", "Throttle actuator control system, forced limited power", "The car has limited its own power", `${byWire} The car found a throttle fault and is holding power back to stay safe. Look for other codes that say why.`);
eThrottle("P2110", "Throttle actuator control system, forced limited RPM", "The car has limited its own revs", `${byWire} The car found a throttle fault and is holding the revs down to stay safe. Look for other codes that say why.`);
eThrottle("P2111", "Throttle actuator control system, stuck open", "The throttle is stuck open", `${byWire} It won't close fully. The engine may rev high by itself, so drive with great care.`, "now");
eThrottle("P2112", "Throttle actuator control system, stuck closed", "The throttle is stuck closed", `${byWire} It won't open properly. The car has very little power or stalls.`);
eThrottle("P2119", "Throttle actuator control throttle body range/performance", "The throttle doesn't move freely", `${byWire} It doesn't open and close the way it should, usually from dirt. Rough idle and reduced power.`);

pedal("P2122", "Throttle/pedal position sensor D circuit low", "Accelerator pedal sensor reads too low");
pedal("P2123", "Throttle/pedal position sensor D circuit high", "Accelerator pedal sensor reads too high");
pedal("P2127", "Throttle/pedal position sensor E circuit low", "Second accelerator pedal sensor reads too low");
pedal("P2128", "Throttle/pedal position sensor E circuit high", "Second accelerator pedal sensor reads too high");
pedal("P2135", "Throttle/pedal position sensor A/B voltage correlation", "The two throttle sensors disagree");
pedal("P2138", "Throttle/pedal position sensor D/E voltage correlation", "The two accelerator pedal sensors disagree");

add(
  "P2181",
  "Cooling system performance",
  say(
    "The cooling system isn't keeping the right temperature",
    "The engine warms up too slowly or runs at the wrong temperature. Most often a thermostat. If the gauge climbs high, stop.",
    ["Thermostat stuck open or closed", "Low coolant level", "Faulty coolant temperature sensor", "Cooling fan fault"],
    "Check the coolant level (engine cold) and watch the temperature gauge on a drive.",
    "soon",
  ),
);

const stuck = (code: string, at: O2, dir: "lean" | "rich") =>
  o2Signal(
    code,
    at,
    `O2 sensor signal biased/stuck ${dir}`,
    `The ${o2Name(at)} is stuck reading ${dir === "lean" ? "too much air" : "too much fuel"}`,
    `The sensor ${o2Where(at)} keeps saying the same thing whatever the engine does. Either the sensor is worn out or the engine really is running ${dir === "lean" ? "short of fuel" : "with too much fuel"}.`,
  );

stuck("P2195", { bank: 1, sensor: 1 }, "lean");
stuck("P2196", { bank: 1, sensor: 1 }, "rich");
stuck("P2270", { bank: 1, sensor: 2 }, "lean");
stuck("P2271", { bank: 1, sensor: 2 }, "rich");

add(
  "P2263",
  "Turbocharger/supercharger boost system performance",
  say(
    "The turbo system isn't performing as it should",
    "Turbo pressure doesn't follow what the engine asks for. The car feels slow or surges, and may smoke.",
    ["Split or loose boost hose", "Sticking turbo vanes", "Blocked soot filter or exhaust", "Worn turbo"],
    "Check the big hoses between the turbo, intercooler and engine for splits, oil mist and loose clamps.",
    "soon",
  ),
);
add(
  "P2279",
  "Intake air system leak",
  say(
    "Air is leaking into the engine",
    "Air is getting into the engine without being measured. It may idle high or rough and use more fuel.",
    ["Cracked or loose vacuum hose", "Loose intake hose clamp", "Leaking intake gasket", "Oil filler cap or dipstick not seated"],
    "With the engine idling, listen for hissing. Check that the oil filler cap and dipstick are pushed fully home.",
    "soon",
  ),
);

// ---------------------------------------------------------------------------------------------
// U0xxx: the car's computers can't talk to each other
// ---------------------------------------------------------------------------------------------

const network = (code: string, official: string, title: string, plain: string, urgency: Urgency = "soon") =>
  add(
    code,
    official,
    say(
      title,
      plain,
      ["Weak battery or poor battery connections", "Corroded plug or damaged wiring", "Blown fuse for that computer", "Failed computer"],
      "Check the battery and its terminals first: low voltage causes most of these. Then check the fuses.",
      urgency,
    ),
  );

const wires = "The car's computers talk to each other over a shared pair of wires.";
network("U0001", "High speed CAN communication bus", "The car's computers have trouble talking to each other", `${wires} That link has a fault. Several warning lights may come on at once.`);
network("U0073", "Control module communication bus A off", "The car's computer network has shut down", `${wires} That link has stopped working. Several systems may fail at once.`);
network("U0100", "Lost communication with ECM/PCM A", "Other computers lost contact with the engine computer", `${wires} The engine computer has gone quiet. The engine may cut out or not start.`, "now");
network("U0101", "Lost communication with TCM", "Lost contact with the gearbox computer", `${wires} The gearbox computer has gone quiet. The gearbox may shift harshly or stay in one gear.`);
network("U0121", "Lost communication with anti-lock brake system (ABS) control module", "Lost contact with the ABS computer", `${wires} The ABS computer has gone quiet. Normal brakes still work, but ABS and stability control may not.`);
network("U0140", "Lost communication with body control module", "Lost contact with the body computer", `${wires} The computer for lights, locks and wipers has gone quiet. Some of those may misbehave.`);
network("U0155", "Lost communication with instrument panel cluster (IPC) control module", "Lost contact with the instrument cluster", `${wires} The dashboard instruments have gone quiet. Gauges and warning lights may not work.`);

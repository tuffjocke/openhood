/**
 * Generic OBD-II trouble codes (P0xxx), shared by every profile whose ECU reports standard codes.
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
 */
import type { FaultInfo } from "@/core/profile";

export const OBD_TITLES: Record<string, string> = {
  P0100: "Mass air flow circuit",
  P0101: "Mass air flow range/performance",
  P0102: "Mass air flow circuit low",
  P0103: "Mass air flow circuit high",
  P0110: "Intake air temperature circuit",
  P0115: "Coolant temperature circuit",
  P0120: "Throttle position sensor circuit",
  P0130: "O2 sensor circuit, bank 1 sensor 1",
  P0171: "System too lean, bank 1",
  P0172: "System too rich, bank 1",
  P0174: "System too lean, bank 2",
  P0175: "System too rich, bank 2",
  P0300: "Random or multiple cylinder misfire",
  P0301: "Cylinder 1 misfire",
  P0302: "Cylinder 2 misfire",
  P0303: "Cylinder 3 misfire",
  P0304: "Cylinder 4 misfire",
  P0305: "Cylinder 5 misfire",
  P0306: "Cylinder 6 misfire",
  P0325: "Knock sensor 1 circuit",
  P0335: "Crankshaft position sensor circuit",
  P0340: "Camshaft position sensor circuit",
  P0401: "EGR flow insufficient",
  P0420: "Catalyst efficiency below threshold, bank 1",
  P0430: "Catalyst efficiency below threshold, bank 2",
  P0442: "Evaporative system small leak",
  P0455: "Evaporative system large leak",
  P0500: "Vehicle speed sensor",
  P0505: "Idle control system",
  P0562: "System voltage low",
  P0563: "System voltage high",
};

const c = "community" as const;

const airFlow = (title: string, plain: string): FaultInfo => ({
  title,
  plain,
  causes: ["Dirty air flow sensor", "Loose or cracked air intake hose", "Damaged sensor plug or wiring", "Failed air flow sensor"],
  check: "Look for a loose clamp or split hose between the air filter and the engine, then check the sensor plug.",
  urgency: "soon",
  confidence: c,
});

const misfire = (cyl?: number): FaultInfo => ({
  title: cyl ? `Cylinder ${cyl} isn't firing properly` : "The engine is misfiring",
  plain:
    (cyl ? `Cylinder ${cyl} isn't burning its fuel properly. ` : "One or more cylinders aren't burning their fuel properly. ") +
    "Unburnt fuel can overheat and ruin the catalytic converter. If the engine light flashes, stop driving.",
  causes: cyl
    ? [`Worn spark plug in cylinder ${cyl}`, `Faulty ignition coil or plug lead for cylinder ${cyl}`, "Leaking injector", "Low compression"]
    : ["Worn spark plugs", "Faulty ignition coils or plug leads", "Air leak in the intake", "Low fuel pressure"],
  check: cyl
    ? `Swap the ignition coil of cylinder ${cyl} with a neighbour. If the misfire moves, the coil is bad.`
    : "Check the spark plugs and plug leads first: they are cheap and the most common cause.",
  urgency: "now",
  confidence: c,
});

const lean = (bank: string): FaultInfo => ({
  title: "Engine is getting too much air or too little fuel",
  plain: `The engine has to add a lot of extra fuel to run right${bank}. Usually an air leak. It can run rough and use more fuel.`,
  causes: ["Cracked or loose vacuum hose", "Dirty air flow sensor", "Weak fuel pump or clogged fuel filter", "Leaking intake gasket"],
  check: "With the engine idling, listen for hissing around the intake and look for split rubber hoses.",
  urgency: "soon",
  confidence: c,
});

const rich = (bank: string): FaultInfo => ({
  title: "Engine is getting too much fuel",
  plain: `The engine is running with more fuel than it needs${bank}. It wastes fuel and can damage the catalytic converter over time.`,
  causes: ["Leaking injector", "Faulty coolant temperature sensor", "Dirty air flow sensor", "Fuel pressure too high"],
  check: "Check the coolant temperature on the dashboard: a sensor stuck reading cold makes the engine run rich.",
  urgency: "soon",
  confidence: c,
});

const catalyst = (bank: string): FaultInfo => ({
  title: "Catalytic converter isn't cleaning the exhaust well enough",
  plain: `The exhaust cleaner${bank} has worn out or a sensor thinks it has. The car drives fine but will likely fail an emissions test.`,
  causes: ["Worn-out catalytic converter", "Faulty oxygen sensor after the converter", "Exhaust leak near the sensors", "Old misfires that damaged the converter"],
  check: "Fix any misfire codes first, then check for exhaust leaks before replacing the converter.",
  urgency: "ok",
  confidence: c,
});

export const OBD_EXPLANATIONS: Record<string, FaultInfo> = {
  P0100: airFlow("Problem with the air flow sensor", "The sensor that measures air going into the engine isn't giving a sensible signal. The engine may run rough or feel weak."),
  P0101: airFlow("Air flow sensor reading doesn't make sense", "The air flow sensor works but its readings don't match how the engine is running. Often just dirt on the sensor."),
  P0102: airFlow("Air flow sensor reads too low", "The air flow sensor reports less air than the engine must be getting. The engine may hesitate or stall."),
  P0103: airFlow("Air flow sensor reads too high", "The air flow sensor reports more air than is possible. The engine may run rich and use more fuel."),
  P0110: {
    title: "Problem with the intake air temperature sensor",
    plain: "The sensor that measures the temperature of incoming air is giving a bad signal. Usually only small effects on running and fuel use.",
    causes: ["Damaged sensor plug or wiring", "Failed sensor (often built into the air flow sensor)"],
    check: "Check the plug on the sensor, which is often part of the air flow sensor.",
    urgency: "ok",
    confidence: c,
  },
  P0115: {
    title: "Problem with the engine temperature sensor",
    plain: "The engine doesn't know how warm it is. It may start badly, idle oddly, or the cooling fan may run all the time.",
    causes: ["Failed coolant temperature sensor", "Damaged sensor plug or wiring", "Low coolant level"],
    check: "Check the coolant level first (engine cold), then the sensor plug.",
    urgency: "soon",
    confidence: c,
  },
  P0120: {
    title: "Problem with the throttle position sensor",
    plain: "The engine can't tell how far the throttle is open. It may hesitate, idle badly or go into a reduced-power mode.",
    causes: ["Worn throttle position sensor", "Dirty throttle body", "Damaged plug or wiring"],
    check: "Check the plug on the throttle body and clean the throttle if it is dirty.",
    urgency: "soon",
    confidence: c,
  },
  P0130: {
    title: "Problem with the front oxygen sensor",
    plain: "The sensor that checks the exhaust before the catalytic converter isn't working right. Fuel use can go up and emissions get worse.",
    causes: ["Worn oxygen sensor", "Damaged wiring near the exhaust", "Exhaust leak before the sensor"],
    check: "Look at the sensor wiring for melted or chafed spots near the exhaust.",
    urgency: "soon",
    confidence: c,
  },
  P0171: lean(""),
  P0172: rich(""),
  P0174: lean(" on the second row of cylinders (V engines)"),
  P0175: rich(" on the second row of cylinders (V engines)"),
  P0300: misfire(),
  P0301: misfire(1),
  P0302: misfire(2),
  P0303: misfire(3),
  P0304: misfire(4),
  P0305: misfire(5),
  P0306: misfire(6),
  P0325: {
    title: "Problem with the knock sensor",
    plain: "The sensor that listens for harmful engine knock isn't working. The engine plays safe and may feel a bit weaker.",
    causes: ["Damaged sensor wiring", "Failed knock sensor", "Loose sensor"],
    check: "Check the sensor's plug and wiring, which often run under the intake.",
    urgency: "soon",
    confidence: c,
  },
  P0335: {
    title: "Problem with the crankshaft position sensor",
    plain: "The engine can't reliably tell where the crankshaft is. It may cut out or refuse to start.",
    causes: ["Failed crankshaft sensor", "Damaged wiring", "Dirt or metal on the sensor tip"],
    check: "Check the sensor plug and wiring near the flywheel or crank pulley.",
    urgency: "now",
    confidence: c,
  },
  P0340: {
    title: "Problem with the camshaft position sensor",
    plain: "The engine can't tell where the camshaft is. It may start slowly, run rough or stall.",
    causes: ["Failed camshaft sensor", "Damaged wiring", "Stretched timing chain or belt"],
    check: "Check the sensor plug and wiring on the cylinder head.",
    urgency: "soon",
    confidence: c,
  },
  P0401: {
    title: "Exhaust gas recirculation isn't flowing enough",
    plain: "The system that feeds some exhaust back into the engine to lower emissions is blocked or stuck. It can cause knocking and failed emissions tests.",
    causes: ["Carbon build-up in the EGR valve or passages", "Stuck EGR valve", "Split vacuum hose to the valve"],
    check: "Clean the EGR valve and its passages, and check its vacuum hose.",
    urgency: "soon",
    confidence: c,
  },
  P0420: catalyst(""),
  P0430: catalyst(" on the second row of cylinders"),
  P0442: {
    title: "Small leak in the fuel vapour system",
    plain: "Fuel vapour is escaping somewhere, often from the fuel cap. No effect on driving, but it can fail an emissions test.",
    causes: ["Loose or worn fuel cap", "Cracked vapour hose", "Faulty purge valve"],
    check: "Tighten the fuel cap until it clicks, or replace a cap with a cracked seal.",
    urgency: "ok",
    confidence: c,
  },
  P0455: {
    title: "Large leak in the fuel vapour system",
    plain: "A lot of fuel vapour is escaping, very often because the fuel cap is missing or not closed. No effect on driving.",
    causes: ["Fuel cap missing or not closed", "Disconnected vapour hose", "Faulty purge or vent valve"],
    check: "Make sure the fuel cap is on and closed properly.",
    urgency: "ok",
    confidence: c,
  },
  P0500: {
    title: "Problem with the road speed signal",
    plain: "The engine computer isn't getting a speed signal. The speedometer may stop working and automatic gearboxes may shift oddly.",
    causes: ["Failed speed sensor", "Damaged wiring", "Faulty ABS sensor on cars that share the signal"],
    check: "Check whether the speedometer works. Then check the speed sensor plug on the gearbox.",
    urgency: "soon",
    confidence: c,
  },
  P0505: {
    title: "Idle speed isn't being controlled properly",
    plain: "The engine struggles to keep a steady idle. It may idle too high, too low, or stall when you stop.",
    causes: ["Dirty throttle body or idle valve", "Air leak in the intake", "Failed idle control valve"],
    check: "Clean the throttle body and idle valve.",
    urgency: "soon",
    confidence: c,
  },
  P0562: {
    title: "Battery voltage is low",
    plain: "The electrical system voltage is too low. The car may struggle to start or other faults may appear.",
    causes: ["Weak or old battery", "Failing alternator", "Corroded battery terminals"],
    check: "Check the Battery or Module voltage reading with the engine running: about 13.5 to 14.5 V is normal.",
    urgency: "soon",
    confidence: c,
  },
  P0563: {
    title: "Battery voltage is too high",
    plain: "The charging system is putting out too much voltage, which can damage the battery and electronics.",
    causes: ["Faulty voltage regulator in the alternator", "Bad earth connection"],
    check: "Check the voltage reading with the engine running: above about 15 V is too high.",
    urgency: "now",
    confidence: c,
  },
};

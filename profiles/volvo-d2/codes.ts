/**
 * Plain-language explanations for Volvo module codes, our own words (writing guide at the top of
 * profiles/shared/obd-codes.ts). Volvo's official code texts live in its VIDA database, which we
 * can't copy, so this starts small: codes whose meaning a public source states (README), most
 * common first. Every other code still shows, with its module's name.
 */
import type { FaultInfo } from "@/core/profile";

export const D2_EXPLANATIONS: Record<string, FaultInfo> = {};

/**
 * CEM-1A5x: the central electronics module stopped hearing from another module. From xemodex's
 * write-up of the 2005 and newer P2 CEM.
 */
const missing: [string, string, string][] = [
  ["CEM-1A51", "airbag computer", "The airbag warning light may be on, and the airbags may not work until it's fixed."],
  ["CEM-1A52", "driver's door module", "Windows, mirrors or central locking on the driver's side may stop working."],
  ["CEM-1A53", "passenger door module", "Windows, mirrors or central locking on the passenger side may stop working."],
  ["CEM-1A54", "power seat module", "The power seat and its memory may stop working."],
  ["CEM-1A55", "climate control", "Heating, cooling or the fan may stop working properly."],
  ["CEM-1A56", "instrument cluster", "Gauges, warning lights or messages on the dash may stop working."],
  ["CEM-1A5D", "rear electronics module", "Rear lights, the tailgate or rear locks may stop working."],
  ["CEM-1A5E", "roof electronics module", "Interior lights, the sunroof or the rain sensor may stop working."],
  ["CEM-1A64", "rear differential module", "Four-wheel drive may switch off and a warning may show."],
];

for (const [code, what, effect] of missing) {
  D2_EXPLANATIONS[code] = {
    title: `The car's central computer can't reach the ${what}`,
    plain: `The two have stopped talking to each other. ${effect}`,
    causes: [
      `A blown fuse or a poor connection at the ${what}`,
      "A low or weak battery (the modules drop out first)",
      "Water in a connector or a damaged wire",
      `A failed ${what}`,
    ],
    check: "Charge the battery fully, then read the codes again. Then check the fuses.",
    urgency: code === "CEM-1A51" ? "now" : "soon",
    confidence: "community",
  };
}

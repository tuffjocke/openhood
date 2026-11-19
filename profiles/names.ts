/**
 * The ONLY makes and models allowed in a profile's `vehicles` list.
 * This keeps the picker free of duplicates and misspellings ("Landrover", "VW", "defender").
 *
 * Rules for adding a name (reviewed in every pull request):
 *  - Use the manufacturer's official spelling, including accents: "Citroën", "Škoda", "Mercedes-Benz".
 *  - Model names as the manufacturer sold them, without engine or trim: "Defender", not "Defender 90 Td5".
 *    Put engine and variant in the profile's `engine` field instead.
 *  - Only real models from the K-line era (roughly 1990 to 2008). If unsure, leave it out and ask.
 *  - Keep makes and each make's models alphabetical.
 *
 * tests/profiles.test.ts fails if a profile uses a name that isn't here.
 */
export const VEHICLE_NAMES: Record<string, string[]> = {
  "Alfa Romeo": [],
  Audi: [],
  BMW: [],
  Citroën: [],
  Fiat: [],
  Ford: [],
  Honda: [],
  Hyundai: [],
  Jaguar: [],
  Kia: [],
  "Land Rover": ["Defender", "Discovery", "Discovery 2", "Freelander", "Range Rover"],
  Lexus: [],
  Mazda: [],
  "Mercedes-Benz": [],
  MG: [],
  Mini: [],
  Mitsubishi: [],
  Nissan: [],
  Opel: [],
  Peugeot: [],
  Porsche: [],
  Renault: [],
  Rover: [],
  Saab: [],
  SEAT: [],
  Škoda: [],
  Subaru: [],
  Suzuki: [],
  Toyota: [],
  Vauxhall: [],
  Volkswagen: [],
  Volvo: [],
};

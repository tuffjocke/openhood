import type { AdapterKind } from "./profile";

/**
 * Adapters we point people to by name, so nobody has to choose among hundreds of look-alike
 * listings. Chosen from independent reviews (see docs/hardware.md for sources), not from our own
 * testing: a pick only counts as tested once profiles/car-reports.json has a working read with it.
 * No affiliate links, ever.
 */
export interface AdapterPick {
  kind: AdapterKind;
  /** The product name people can search for. Car reports use the same text in adapterModel. */
  name: string;
  /** Other names car reports use for the same adapter (adapterModel), e.g. how a seller lists it. */
  alsoSoldAs?: string[];
  /** What to type into a shop search. Defaults to the name. */
  search?: string;
  connects: "USB" | "Bluetooth";
  /** A few words: why this one. */
  why: string;
  /**
   * Product pages we have seen, by Amazon site. Only real listings found by search, never guessed
   * ids. Listings go stale: check them now and then. No affiliate tags.
   */
  products?: Record<string, string>;
}

export const ADAPTER_PICKS: AdapterPick[] = [
  {
    kind: "elm327",
    name: "Vgate iCar Pro 2S",
    connects: "Bluetooth",
    why: "Cheap and well reviewed.",
    products: {
      "amazon.com": "https://www.amazon.com/Vgate-iCar-Pro-Android-Windows/dp/B0CYZRMCK9",
      "amazon.de": "https://www.amazon.de/Vgate-iCar-Pro-2S-Diagnostic/dp/B0D4Y77CYX",
      "amazon.se": "https://www.amazon.se/dp/B0D4Y77CYX",
    },
  },
  { kind: "elm327", name: "Veepeak OBDCheck BLE", connects: "Bluetooth", why: "Cheap, also well reviewed." },
  { kind: "elm327", name: "OBDLink EX", connects: "USB", why: "A cable, nothing to pair. Costs more." },
  { kind: "elm327", name: "OBDLink MX+", connects: "Bluetooth", why: "The best, and the priciest. Pair it with your computer first." },
  {
    kind: "kkl",
    name: "KKL 409.1 cable with FTDI chip",
    alsoSoldAs: ["VAG-COM KKL 409.1 USB"],
    search: "KKL 409.1 FT232RL",
    connects: "USB",
    why: "No brand to look for: check that the listing says FT232RL.",
  },
];

/** Whether a car report's adapterModel names this pick (its name or another name it is sold as). */
export function isPick(p: AdapterPick, adapterModel: string | undefined): boolean {
  const m = adapterModel?.trim().toLowerCase();
  return !!m && [p.name, ...(p.alsoSoldAs ?? [])].some((n) => n.toLowerCase() === m);
}

export const firstPick = (kind: AdapterKind) => ADAPTER_PICKS.find((p) => p.kind === kind);

/** Amazon's site for a browser language such as "sv-SE". Falls back to amazon.com. */
export function amazonSite(locale: string): string {
  const region = locale.split("-")[1]?.toUpperCase() ?? "";
  const sites: Record<string, string> = {
    SE: "amazon.se", DE: "amazon.de", AT: "amazon.de", GB: "amazon.co.uk", IE: "amazon.co.uk", FR: "amazon.fr",
    IT: "amazon.it", ES: "amazon.es", NL: "amazon.nl", BE: "amazon.com.be", PL: "amazon.pl", CA: "amazon.ca",
    AU: "amazon.com.au",
  };
  return sites[region] ?? "amazon.com";
}

/** A search for the product by name, for when we know no listing on the person's Amazon site. */
export const amazonSearch = (pick: AdapterPick, locale: string) =>
  `https://www.${amazonSite(locale)}/s?k=${encodeURIComponent(pick.search ?? pick.name)}`;

/**
 * Where "buy" goes: the product page on the person's own Amazon site if we know one, otherwise a
 * search by name on their site. Never another country's listing: it may not open or deliver there.
 */
export function amazonLink(pick: AdapterPick, locale: string): { url: string; product: boolean } {
  const site = amazonSite(locale);
  const url = pick.products?.[site];
  return url ? { url, product: true } : { url: amazonSearch(pick, locale), product: false };
}

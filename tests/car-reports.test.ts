import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getProfile } from "@/profiles";
import { CAR_REPORTS, reportsFor, summarise, type CarReport } from "@/profiles/car-reports";
import { VEHICLE_NAMES } from "@/profiles/names";

describe("car reports", () => {
  it("every entry is valid and has nothing personal", () => {
    for (const r of CAR_REPORTS) {
      const where = `${r.make} ${r.model} ${r.year}`;
      assert.ok(r.make in VEHICLE_NAMES, `${where}: make not in profiles/names.ts`);
      assert.ok(VEHICLE_NAMES[r.make].includes(r.model), `${where}: model not in profiles/names.ts, add it there first`);
      assert.ok(Number.isInteger(r.year) && r.year >= 1980 && r.year <= new Date().getFullYear() + 1, `${where}: year`);
      assert.ok(getProfile(r.profile), `${where}: unknown profile ${r.profile}`);
      assert.ok(["kkl", "elm327"].includes(r.adapter), `${where}: adapter`);
      assert.ok(["worked", "partly", "failed"].includes(r.result), `${where}: result`);
      assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/, `${where}: date`);
      if (r.adapterModel !== undefined) assert.match(r.adapterModel, /^[\p{L}\p{N} .+-]{2,60}$/u, `${where}: adapterModel`);
      // Notes are read by people and by AI agents working in the repo: keep them short and plain.
      if (r.notes !== undefined) {
        assert.ok(r.notes.length <= 160, `${where}: notes longer than 160 characters`);
        assert.match(r.notes, /^[\p{L}\p{N} .,:;()'\/+-]*$/u, `${where}: notes may only hold plain words and numbers`);
        assert.doesNotMatch(r.notes, /https?:|www\./i, `${where}: no links in notes`);
      }
      const text = JSON.stringify(r);
      assert.doesNotMatch(text, /\b[A-HJ-NPR-Z0-9]{17}\b/, `${where}: looks like a VIN`);
      assert.doesNotMatch(text, /\b[PCBU][0-3][0-9A-F]{3}\b/, `${where}: fault codes don't belong here`);
    }
  });

  it("finds nearby years and says it plainly", () => {
    const base: CarReport = { make: "Volvo", model: "V70", year: 2003, profile: "generic-obd2", adapter: "elm327", protocol: "ISO 14230-4 (KWP FAST)", result: "worked", date: "2026-11-20" };
    const all = [base, { ...base, year: 2004 }, { ...base, year: 2009 }, { ...base, year: 2002, result: "failed" as const }];
    const found = reportsFor("Volvo", "v70", 2003, all);
    assert.equal(found.length, 3);
    assert.equal(summarise(found), "Read by 2 people (2002 to 2004), with an ELM327 adapter. 1 more had trouble.");
    assert.equal(summarise([]), null);
  });

  it("searches the shop for the person's country, by product name", async () => {
    const { ADAPTER_PICKS, amazonSearch, amazonSite } = await import("@/core/adapters");
    assert.equal(amazonSite("sv-SE"), "amazon.se");
    assert.equal(amazonSite("en"), "amazon.com");
    const url = new URL(amazonSearch(ADAPTER_PICKS[0], "de-DE"));
    assert.equal(url.host, "www.amazon.de");
    assert.equal(url.searchParams.get("k"), ADAPTER_PICKS[0].name);
    assert.equal(url.searchParams.has("tag"), false, "no affiliate tag");
    const { amazonLink } = await import("@/core/adapters");
    for (const p of ADAPTER_PICKS)
      for (const u of Object.values(p.products ?? {})) {
        assert.match(u, /^https:\/\/www\.amazon\.[a-z.]+\/([^?]*\/)?dp\/[A-Z0-9]{10}$/, `${p.name}: a plain product link`);
      }
    assert.equal(amazonLink(ADAPTER_PICKS[0], "en-US").product, true);
    assert.match(amazonLink(ADAPTER_PICKS[0], "sv-SE").url, /^https:\/\/www\.amazon\.se\/dp\//, "Sweden gets the Swedish listing");
    assert.equal(amazonLink(ADAPTER_PICKS[0], "fr-FR").product, false, "no listing known: a search on their own site");
    assert.equal(amazonLink(ADAPTER_PICKS[0], "en-AU").product, false, "elsewhere: a search");
  });
});

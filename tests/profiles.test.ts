/**
 * Contract tests. Every registered profile (and the template) must:
 *  1. be internally consistent (ids, schedule, channels)
 *  2. connect to its own simulator, read every group, and produce every channel
 *
 * These run in CI. A new profile gets all of this for free once it is in /profiles/index.ts.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { VehicleProfile } from "@/core/profile";
import { Session } from "@/core/session";
import { ElmLink } from "@/core/link/elm327";
import { SimulatedTransport } from "@/core/transport/simulated";
import { SimulatedElm } from "@/core/transport/simulated-elm";
import { templateProfile } from "@/profiles/_template";
import { PROFILES } from "@/profiles";
import { VEHICLE_NAMES } from "@/profiles/names";

const all: VehicleProfile[] = [...PROFILES, templateProfile];

for (const p of all) {
  describe(`profile ${p.id}`, () => {
    it("has a kebab-case id and unique group and channel keys", () => {
      assert.match(p.id, /^[a-z0-9]+(-[a-z0-9]+)*$/);
      const gids = p.groups.map((g) => g.id);
      assert.equal(new Set(gids).size, gids.length, "duplicate group id");
      const keys = p.channels.map((c) => c.key);
      assert.equal(new Set(keys).size, keys.length, "duplicate channel key");
    });

    it("lists the vehicles it is for", () => {
      if (p.generic) return;
      assert.ok(p.vehicles.length > 0, "non-generic profile without vehicles");
      for (const v of p.vehicles) {
        assert.ok(v.make && v.model && v.engine, "make, model and engine are required");
        assert.ok(v.from >= 1980 && v.from <= v.to && v.to <= 2030, `bad years ${v.from} to ${v.to}`);
        if (p === templateProfile) continue;
        assert.ok(v.make in VEHICLE_NAMES, `unknown make "${v.make}": use a name from profiles/names.ts or add it there`);
        assert.ok(
          VEHICLE_NAMES[v.make].includes(v.model),
          `unknown model "${v.make} ${v.model}": use a name from profiles/names.ts or add it there`,
        );
      }
    });

    it("only schedules groups that exist", () => {
      const gids = new Set(p.groups.map((g) => g.id));
      for (const id of [...p.schedule, ...(p.slowGroups ?? [])]) assert.ok(gids.has(id), `unknown group "${id}"`);
      assert.ok(p.schedule.length > 0, "empty schedule");
    });

    it("connects to its simulator and decodes every channel in range", async () => {
      const s = new Session(p, new SimulatedTransport(p));
      await s.connect();
      for (const g of p.groups) {
        const v = await s.readGroup(g.id);
        for (const [k, x] of Object.entries(v)) assert.ok(Number.isFinite(x), `${g.id}.${k} is ${x}`);
      }
      for (const c of p.channels) {
        const v = s.state[c.key];
        assert.ok(v !== undefined, `no group produces channel "${c.key}"`);
        const slack = (c.max - c.min) * 0.25;
        assert.ok(v >= c.min - slack && v <= c.max + slack, `${c.key} = ${v} outside ${c.min}..${c.max}`);
      }
      if (p.faults) {
        const before = await s.readFaults();
        assert.ok(Array.isArray(before));
        if (p.faults.clear) {
          await s.clearFaults();
          assert.deepEqual(await s.readFaults(), []);
        }
      }
      await s.disconnect();
    });

    for (const can of [true, false]) {
      it(`runs through an ELM327 adapter (${can ? "CAN" : "K-line"}) if it says it can`, async () => {
        if (!(p.adapters ?? ["kkl"]).includes("elm327")) return;
        const s = new Session(p, new ElmLink(new SimulatedElm(p, { can })));
        await s.connect();
        assert.equal(s.init.kind, "adapter");
        for (const id of p.schedule) if (s.isActive(id)) await s.readGroup(id);
        for (const c of p.channels) if (!s.unavailableChannels.has(c.key)) assert.ok(s.state[c.key] !== undefined, c.key);
        if (p.faults) {
          const ref = new Session(p, new SimulatedTransport(p));
          await ref.connect();
          const want = (await ref.readFaults()).map((f) => f.id);
          await ref.disconnect();
          assert.deepEqual((await s.readFaults()).map((f) => f.id), want, "same faults as over the K-line");
        }
        await s.disconnect();
      });
    }
  });
}

describe("vehicle names", () => {
  const lower = (xs: string[]) => xs.map((x) => x.toLocaleLowerCase());
  const sorted = (xs: string[]) => [...xs].sort((a, b) => a.localeCompare(b));

  it("has no duplicate or near-duplicate makes, and is alphabetical", () => {
    const makes = Object.keys(VEHICLE_NAMES);
    assert.equal(new Set(lower(makes)).size, makes.length);
    assert.deepEqual(makes, sorted(makes));
  });

  it("has no duplicate models within a make, and each list is alphabetical", () => {
    for (const [make, models] of Object.entries(VEHICLE_NAMES)) {
      assert.equal(new Set(lower(models)).size, models.length, `duplicate model under ${make}`);
      assert.deepEqual(models, sorted(models), `${make} models not alphabetical`);
      for (const m of models) assert.ok(!m.toLocaleLowerCase().startsWith(make.toLocaleLowerCase() + " "), `"${m}" repeats the make`);
    }
  });
});

describe("registry", () => {
  it("has exactly one generic profile", () => {
    assert.equal(PROFILES.filter((p) => p.generic).length, 1);
  });
});

// Known-answer tests for security algorithms go here once captured from real ECUs:
// it("td5Key matches a real ECU", () => assert.equal(td5Key(0x1234), 0xABCD));

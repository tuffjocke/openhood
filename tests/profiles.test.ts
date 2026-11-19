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
import { SimulatedTransport } from "@/core/transport/simulated";
import { templateProfile } from "@/profiles/_template";
import { PROFILES } from "@/profiles";

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
  });
}

describe("registry", () => {
  it("has exactly one generic profile", () => {
    assert.equal(PROFILES.filter((p) => p.generic).length, 1);
  });
});

// Known-answer tests for security algorithms go here once captured from real ECUs:
// it("td5Key matches a real ECU", () => assert.equal(td5Key(0x1234), 0xABCD));

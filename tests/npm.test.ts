/**
 * The npm package builds into one file and runs on its own: profiles, explain, and a read of a
 * simulated car, from outside the repository (so `record` can't touch the repo's files).
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";

describe("npm package", () => {
  it("builds and runs outside the repository", () => {
    execFileSync("node", ["scripts/build-npm.mjs"], { stdio: "pipe" });
    const pkg = JSON.parse(readFileSync("dist/npm/package.json", "utf8"));
    assert.equal(pkg.bin.openhood, "openhood.js");
    assert.deepEqual(Object.keys(pkg.dependencies), ["serialport"], "nothing but serialport at runtime");

    // Run from an empty folder, with serialport reachable the way npm would install it.
    const dir = mkdtempSync(join(tmpdir(), "openhood-npm-"));
    symlinkSync(resolve("node_modules"), join(dir, "node_modules"));
    const bin = resolve("dist/npm/openhood.js");
    const run = (...args: string[]) => execFileSync("node", [bin, ...args], { cwd: dir, encoding: "utf8" });

    const ids = (JSON.parse(run("profiles")) as { id: string }[]).map((p) => p.id);
    assert.ok(ids.includes("generic-obd2") && ids.includes("vw-audi-kwp1281"));
    assert.match(run("explain", "P0171"), /too much air/);
    const faults = run("faults", "--profile", "vw-audi-kwp1281");
    assert.match(faults, /00522/, "the fault names table loads inside the bundle");
    assert.throws(() => run("mcp", "--unsafe-allow-any-request"), "the published package never lifts the read-only limit");
  });
});

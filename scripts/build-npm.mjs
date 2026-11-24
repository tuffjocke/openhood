/**
 * Builds the npm package `openhood`: the command-line tools and MCP server in one file, with the
 * car profiles inside, so people and agents can run `npx openhood` without cloning the website.
 * Only serialport is installed with it (it talks to the adapter and has native parts).
 *
 *   npm run build:npm        → dist/npm
 *   npm publish ./dist/npm     (a maintainer; the release workflow stages it for approval instead)
 */
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const root = JSON.parse(readFileSync("package.json", "utf8"));
const out = "dist/npm";
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// The website, for the MCP server's live view (cli/watch-server.ts serves it on 127.0.0.1): built at
// the root (no BASE_PATH) and without the service worker, then copied next to the bundle.
execFileSync(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
  stdio: ["ignore", "ignore", "inherit"],
  env: { ...process.env, BASE_PATH: "", NEXT_PUBLIC_OPENHOOD_LOCAL: "1", NEXT_TELEMETRY_DISABLED: "1" },
});
cpSync("out", `${out}/site`, { recursive: true });

await build({
  entryPoints: ["cli/openhood.ts"],
  outfile: `${out}/openhood.js`,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  external: ["serialport"],
  define: { OPENHOOD_NPM: "true", OPENHOOD_VERSION: JSON.stringify(root.version) },
  banner: { js: "#!/usr/bin/env node" },
  legalComments: "none",
  logLevel: "warning",
});

writeFileSync(
  `${out}/package.json`,
  JSON.stringify(
    {
      name: "openhood",
      version: root.version,
      description: "Read your car's fault codes and live data from the command line, or let an AI agent do it over MCP.",
      type: "module",
      bin: { openhood: "openhood.js" },
      files: ["openhood.js", "site", "README.md", "LICENSE"],
      engines: { node: ">=20" },
      dependencies: { serialport: root.devDependencies.serialport },
      license: "GPL-3.0-only",
      homepage: "https://tuffjocke.github.io/openhood/",
      repository: { type: "git", url: "git+https://github.com/tuffjocke/openhood.git" },
      bugs: "https://github.com/tuffjocke/openhood/issues",
      keywords: ["obd2", "obd-ii", "elm327", "kkl", "kwp2000", "kwp1281", "car", "diagnostics", "fault codes", "mcp"],
    },
    null,
    2,
  ) + "\n",
);
copyFileSync("LICENSE", `${out}/LICENSE`);
writeFileSync(
  `${out}/README.md`,
  `# Openhood

Read your car's fault codes and live data with a cheap adapter, in plain words. Read only.
The same tools as the website (https://tuffjocke.github.io/openhood/), for the command line and AI agents.

\`\`\`
npx openhood ports                                   find your adapter
npx openhood profiles                                which cars have their own profile
npx openhood faults --profile generic-obd2 --port <port>
npx openhood live --profile generic-obd2 --port <port> --seconds 5
npx openhood explain P0171                           a code in plain words, no car needed
\`\`\`

Leave out \`--port\` to try it on a simulated car.

## For AI agents (MCP)

\`\`\`json
{ "mcpServers": { "openhood": { "command": "npx", "args": ["-y", "openhood", "mcp"] } } }
\`\`\`

Tools: \`connect\`, \`read_faults\`, \`read_live\`, \`request\` (read-only requests only), \`traffic\`,
\`explain\`, and \`clear_faults\`, which needs the person's yes.

While it runs, a live view shows what the agent reads (readings, fault codes, traffic) in your browser
at http://127.0.0.1:4848/watch/, on this computer only. It opens by itself at the first connect
(\`mcp --no-open\` to stop that, \`mcp --no-watch\` to turn it off).

More: https://github.com/tuffjocke/openhood/blob/main/docs/cli.md · GPL-3.0
`,
);
console.log(`Built ${out} (openhood ${root.version})`);

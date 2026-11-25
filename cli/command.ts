/**
 * How people run Openhood's CLI here: `npx -y openhood@latest` from the npm package (`@latest`, or
 * npx keeps running whatever copy it found first), `npm run openhood --` in a clone of the repository. The npm build sets OPENHOOD_NPM (scripts/build-npm.mjs).
 */
declare const OPENHOOD_NPM: boolean | undefined;
declare const OPENHOOD_VERSION: string | undefined;

/** The package version, set by the npm build; "dev" when run from a clone. */
export const VERSION = typeof OPENHOOD_VERSION !== "undefined" ? OPENHOOD_VERSION : "dev";

export const FROM_NPM = typeof OPENHOOD_NPM !== "undefined" && OPENHOOD_NPM;

/** The command to show in help and messages. */
export const CMD = FROM_NPM ? "npx -y openhood@latest" : "npm run openhood --";

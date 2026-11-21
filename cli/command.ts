/**
 * How people run Openhood's CLI here: `npx openhood` from the npm package, `npm run openhood --`
 * in a clone of the repository. The npm build sets OPENHOOD_NPM (scripts/build-npm.mjs).
 */
declare const OPENHOOD_NPM: boolean | undefined;

export const FROM_NPM = typeof OPENHOOD_NPM !== "undefined" && OPENHOOD_NPM;

/** The command to show in help and messages. */
export const CMD = FROM_NPM ? "npx openhood" : "npm run openhood --";

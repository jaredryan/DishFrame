#!/usr/bin/env node
// Guarded, ordered production release workflow:
//   1. verify the repo is on `main` with a clean working tree
//   2. `pnpm run verify:all`
//   3. re-check the working tree is still clean (verify:all's
//      format/build steps can modify files)
//   4. `pnpm db:deploy:production` (migrate + backfill production Neon)
//   5. `git push origin main`
//
// Stops immediately on the first failure — production must never receive
// application code unless verification and the production migration have
// both already succeeded. Never commits anything on your behalf.
//
// No CONFIRM_PRODUCTION_DATABASE=yes gate here — see README.md's
// "Production deployment" section: the only production-database-touching
// step this runs (db:deploy:production) is additive-only (migrate +
// idempotent backfill), so an extra per-run confirmation flag added no
// real safety over the git/verification checks below.

import { spawnSync } from "node:child_process";

const COMMAND_LABEL = "release:production";

function run(command, args) {
  console.warn(`\n[${COMMAND_LABEL}] running: ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) {
    console.error(
      `[${COMMAND_LABEL}] Failed to start ${command}:`,
      result.error.message,
    );
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(
      `[${COMMAND_LABEL}] ${command} ${args.join(" ")} exited with code ` +
        `${result.status} — stopping before any later step.`,
    );
    process.exit(result.status ?? 1);
  }
}

function captureGit(args) {
  const result = spawnSync("git", args, { encoding: "utf-8" });
  if (result.error || result.status !== 0) {
    console.error(`[${COMMAND_LABEL}] git ${args.join(" ")} failed.`);
    process.exit(1);
  }
  return result.stdout.trim();
}

function requireMainBranch() {
  const branch = captureGit(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch !== "main") {
    console.error(
      `[${COMMAND_LABEL}] Refusing to continue: current branch is ` +
        `"${branch}", not "main".`,
    );
    process.exit(1);
  }
}

function requireCleanWorkingTree(context) {
  const status = captureGit(["status", "--porcelain"]);
  if (status !== "") {
    console.error(
      `[${COMMAND_LABEL}] Refusing to continue ${context}: the working ` +
        "tree is not clean. Review and commit your changes first:\n\n" +
        `${status}\n`,
    );
    process.exit(1);
  }
}

requireMainBranch();
requireCleanWorkingTree("before verification");

run("pnpm", ["run", "verify:all"]);

requireCleanWorkingTree("after verify:all");

run("pnpm", ["run", "db:deploy:production"]);

run("git", ["push", "origin", "main"]);

console.warn(
  `\n[${COMMAND_LABEL}] done — production database migrated and main pushed.`,
);

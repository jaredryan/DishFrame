import { execFileSync } from "node:child_process";

const PORT = 3000;

/**
 * `verify:e2e`'s `webServer.reuseExistingServer` (playwright.config.ts) is
 * `true` outside CI, so Playwright will happily attach to whatever's
 * already listening on :3000 — including a wedged/unresponsive `next dev`
 * left over from an earlier session. Run before every `verify:e2e` so a
 * stuck server can never silently swallow the whole suite; harmless/no-op
 * when nothing is listening.
 */
try {
  const pids = execFileSync("lsof", [`-ti:${PORT}`], { encoding: "utf8" })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const pid of pids) {
    console.log(
      `[kill-dev-server] stopping stale process on :${PORT} (pid ${pid})`,
    );
    process.kill(Number(pid), "SIGKILL");
  }
} catch {
  // lsof exits non-zero when nothing is listening on the port — expected.
}

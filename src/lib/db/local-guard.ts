const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

type LocalDatabaseEnv = {
  DATABASE_URL?: string;
  DIRECT_URL?: string;
  DATABASE_DRIVER?: string;
};

/**
 * Refuses to proceed unless the environment unambiguously targets the
 * disposable local/CI Postgres (docker-compose.yml) — never Neon,
 * production, or an unrecognized remote database. Checked on both
 * DATABASE_URL and DIRECT_URL, and never on DATABASE_DRIVER alone: a
 * misconfigured .env.production-access.local override could otherwise
 * set DATABASE_DRIVER=pg while pointing at a real Neon host.
 */
export function assertLocalDatabaseEnv(vars: LocalDatabaseEnv): void {
  if (vars.DATABASE_DRIVER !== "pg") {
    throw new Error(
      `Refusing to run: DATABASE_DRIVER is "${vars.DATABASE_DRIVER ?? "unset"}", not "pg". ` +
        "This command only ever runs against the disposable local Postgres — see docker-compose.yml.",
    );
  }

  for (const [name, value] of [
    ["DATABASE_URL", vars.DATABASE_URL],
    ["DIRECT_URL", vars.DIRECT_URL],
  ] as const) {
    if (!value) {
      throw new Error(`Refusing to run: ${name} is not set.`);
    }

    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error(
        `Refusing to run: ${name} is not a valid connection URL.`,
      );
    }

    const hostname = parsed.hostname.replace(/^\[|\]$/g, "");

    if (hostname.toLowerCase().includes("neon.tech")) {
      throw new Error(
        `Refusing to run: ${name} points at a neon.tech host. This command must never run against Neon.`,
      );
    }

    if (!LOCAL_HOSTNAMES.has(hostname)) {
      throw new Error(
        `Refusing to run: ${name}'s host ("${hostname}") is not a recognized local database host ` +
          `(${[...LOCAL_HOSTNAMES].join(", ")}). This command only ever runs against the disposable local Postgres.`,
      );
    }
  }
}

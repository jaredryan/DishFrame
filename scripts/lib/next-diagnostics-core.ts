/**
 * Testable core of scripts/next-diagnostics.ts, split out so the
 * plugin-load-failure and diagnostic-code-filtering logic can be unit
 * tested without needing tsx or a real Next.js language-service instance.
 *
 * Everything here depends on Next.js internal (non-public-API) modules —
 * next/dist/server/next-typescript.js and
 * next/dist/server/typescript/constant.js. Both are expected to keep
 * moving/changing across Next.js upgrades; that's exactly why every load
 * path here fails loudly instead of degrading to "no diagnostics found".
 */
import { createRequire } from "node:module";

export class NextPluginLoadError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "NextPluginLoadError";
  }
}

export interface NextTsPlugin {
  getSemanticDiagnostics: (fileName: string) => readonly {
    code?: number;
    category: number;
    messageText: unknown;
    file?: unknown;
    start?: number;
  }[];
}

/** Names NEXT_TS_ERRORS was last confirmed to export (Next.js 16.2.11). */
const KNOWN_NEXT_TS_ERROR_NAMES = [
  "INVALID_SERVER_API",
  "INVALID_ENTRY_EXPORT",
  "INVALID_OPTION_VALUE",
  "MISPLACED_ENTRY_DIRECTIVE",
  "INVALID_PAGE_PROP",
  "INVALID_CONFIG_OPTION",
  "INVALID_CLIENT_ENTRY_PROP",
  "INVALID_METADATA_EXPORT",
  "INVALID_ERROR_COMPONENT",
  "INVALID_ENTRY_DIRECTIVE",
  "INVALID_SERVER_ENTRY_RETURN",
] as const;

export function getInstalledNextVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require("next/package.json") as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

async function importOrThrow<T>(
  specifier: string,
  describeFailure: (cause: unknown) => string,
): Promise<T> {
  try {
    return (await import(specifier)) as T;
  } catch (cause) {
    throw new NextPluginLoadError(describeFailure(cause), { cause });
  }
}

/**
 * Validates and instantiates the Next.js TS plugin from an already-imported
 * module object. Split from loadNextTsPlugin so tests can exercise the
 * "API shape changed" failure paths with a fabricated module instead of
 * mocking the real Next.js import.
 */
export function instantiateNextTsPlugin(
  mod: Record<string, unknown>,
  typescriptModule: unknown,
  info: unknown,
  nextVersion: string,
): NextTsPlugin {
  const createTSPlugin = mod.createTSPlugin;
  if (typeof createTSPlugin !== "function") {
    throw new NextPluginLoadError(
      `next/dist/server/next-typescript.js (installed Next.js ${nextVersion}) no longer ` +
        `exports a "createTSPlugin" function. The Next.js TypeScript diagnostics plugin ` +
        `could not be loaded — this diagnostics tooling depends on a Next.js internal ` +
        `implementation detail that changed and needs maintenance after this Next.js upgrade ` +
        `(see scripts/next-diagnostics.ts).`,
    );
  }

  let pluginInstance: unknown;
  try {
    const factory = createTSPlugin as (arg: { typescript: unknown }) => {
      create: (info: unknown) => unknown;
    };
    pluginInstance = factory({ typescript: typescriptModule }).create(info);
  } catch (cause) {
    throw new NextPluginLoadError(
      `The Next.js TypeScript diagnostics plugin (installed Next.js ${nextVersion}) threw ` +
        `while initializing. This diagnostics tooling depends on a Next.js internal ` +
        `implementation detail that changed and needs maintenance after this Next.js upgrade ` +
        `(see scripts/next-diagnostics.ts).`,
      { cause },
    );
  }

  if (
    !pluginInstance ||
    typeof (pluginInstance as { getSemanticDiagnostics?: unknown })
      .getSemanticDiagnostics !== "function"
  ) {
    throw new NextPluginLoadError(
      `The Next.js TypeScript diagnostics plugin (installed Next.js ${nextVersion}) ` +
        `initialized but does not expose a "getSemanticDiagnostics" function. The Next.js ` +
        `TypeScript diagnostics plugin could not be loaded — this diagnostics tooling depends ` +
        `on a Next.js internal implementation detail that changed and needs maintenance after ` +
        `this Next.js upgrade (see scripts/next-diagnostics.ts).`,
    );
  }

  return pluginInstance as NextTsPlugin;
}

export async function loadNextTsPlugin(
  typescriptModule: unknown,
  info: unknown,
  nextVersion: string,
): Promise<NextTsPlugin> {
  const mod = await importOrThrow<Record<string, unknown>>(
    "next/dist/server/next-typescript.js",
    (cause) =>
      `Could not import the Next.js TypeScript diagnostics plugin from ` +
      `next/dist/server/next-typescript.js (installed Next.js ${nextVersion}). The Next.js ` +
      `TypeScript diagnostics plugin could not be loaded — this diagnostics tooling depends on ` +
      `a Next.js internal implementation detail that moved or was removed and needs ` +
      `maintenance after this Next.js upgrade (see scripts/next-diagnostics.ts). ` +
      `Underlying error: ${cause instanceof Error ? cause.message : String(cause)}`,
  );
  return instantiateNextTsPlugin(mod, typescriptModule, info, nextVersion);
}

export interface NextTsErrorCodes {
  /** Every known Next-plugin diagnostic code, sourced from Next.js itself. */
  codes: ReadonlySet<number>;
  /** Code lookup by constant name, e.g. byName.INVALID_CLIENT_ENTRY_PROP. */
  byName: Readonly<Record<string, number>>;
  /** Non-null when the exported names differ from KNOWN_NEXT_TS_ERROR_NAMES. */
  driftWarning: string | null;
}

/**
 * Validates and extracts NEXT_TS_ERRORS from an already-imported module
 * object. Split out so tests can exercise malformed/drifted shapes without
 * needing the real Next.js module.
 */
export function extractNextTsErrorCodes(
  mod: Record<string, unknown>,
  nextVersion: string,
): NextTsErrorCodes {
  const nextTsErrors = mod.NEXT_TS_ERRORS;
  if (!nextTsErrors || typeof nextTsErrors !== "object") {
    throw new NextPluginLoadError(
      `next/dist/server/typescript/constant.js (installed Next.js ${nextVersion}) no longer ` +
        `exports a "NEXT_TS_ERRORS" object. This diagnostics tooling relies on it to tell ` +
        `Next-plugin diagnostics apart from ordinary TypeScript diagnostics, and needs ` +
        `maintenance after this Next.js upgrade (see scripts/next-diagnostics.ts).`,
    );
  }

  const byName: Record<string, number> = {};
  for (const [name, value] of Object.entries(
    nextTsErrors as Record<string, unknown>,
  )) {
    if (typeof value !== "number" || !Number.isInteger(value)) {
      throw new NextPluginLoadError(
        `next/dist/server/typescript/constant.js's NEXT_TS_ERRORS.${name} (installed Next.js ` +
          `${nextVersion}) is not an integer diagnostic code (got ${JSON.stringify(value)}). ` +
          `This diagnostics tooling needs maintenance after this Next.js upgrade (see ` +
          `scripts/next-diagnostics.ts).`,
      );
    }
    byName[name] = value;
  }

  if (Object.keys(byName).length === 0) {
    throw new NextPluginLoadError(
      `next/dist/server/typescript/constant.js's NEXT_TS_ERRORS (installed Next.js ` +
        `${nextVersion}) is empty. This diagnostics tooling needs maintenance after this ` +
        `Next.js upgrade (see scripts/next-diagnostics.ts).`,
    );
  }

  const knownNames = new Set(Object.keys(byName));
  const missing = KNOWN_NEXT_TS_ERROR_NAMES.filter(
    (name) => !knownNames.has(name),
  );
  const added = [...knownNames].filter(
    (name) => !(KNOWN_NEXT_TS_ERROR_NAMES as readonly string[]).includes(name),
  );
  const driftWarning =
    missing.length > 0 || added.length > 0
      ? `[next-diagnostics] Next.js ${nextVersion}'s NEXT_TS_ERRORS differs from the set this ` +
        `tooling was last reviewed against` +
        (missing.length > 0 ? ` — missing: ${missing.join(", ")}` : "") +
        (added.length > 0 ? ` — new: ${added.join(", ")}` : "") +
        `. Review scripts/lib/next-diagnostics-core.ts's KNOWN_NEXT_TS_ERROR_NAMES and the ` +
        `unstable_retry exemption for continued accuracy.`
      : null;

  return { codes: new Set(Object.values(byName)), byName, driftWarning };
}

export async function loadNextTsErrorCodes(
  nextVersion: string,
): Promise<NextTsErrorCodes> {
  const mod = await importOrThrow<Record<string, unknown>>(
    "next/dist/server/typescript/constant.js",
    (cause) =>
      `Could not import Next.js's own diagnostic-code constants from ` +
      `next/dist/server/typescript/constant.js (installed Next.js ${nextVersion}). This ` +
      `diagnostics tooling relies on it to tell Next-plugin diagnostics apart from ordinary ` +
      `TypeScript diagnostics, and needs maintenance after this Next.js upgrade (see ` +
      `scripts/next-diagnostics.ts). Underlying error: ` +
      `${cause instanceof Error ? cause.message : String(cause)}`,
  );
  return extractNextTsErrorCodes(mod, nextVersion);
}

/**
 * The plugin's client-boundary rule (rules/client-boundary.js) exempts the
 * `reset` prop on error.tsx/global-error.tsx as a known special case
 * (vercel/next.js#46573), but Next 16 renamed that framework-injected prop
 * to `unstable_retry` (see
 * node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md)
 * without updating the plugin's allowlist. error.tsx/global-error.tsx are
 * mandatory client entry points and `unstable_retry` is the framework's own
 * contract, not something DishFrame can rename — treat this one
 * code/file/prop combination as a known plugin gap rather than a real
 * finding. Re-evaluate this exemption on future Next.js upgrades — if the
 * plugin's allowlist is fixed, this predicate should stop matching anything
 * and can be deleted.
 */
export function isUnstableRetryPluginFalsePositive(
  diagnostic: { code: number; fileName: string; message: string },
  invalidClientEntryPropCode: number | undefined,
): boolean {
  return (
    diagnostic.code === invalidClientEntryPropCode &&
    /[\\/](error|global-error)\.tsx?$/.test(diagnostic.fileName) &&
    diagnostic.message.includes('"unstable_retry"')
  );
}

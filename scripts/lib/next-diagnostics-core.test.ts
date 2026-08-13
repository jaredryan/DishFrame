import { describe, expect, it } from "vitest";
import {
  extractNextTsErrorCodes,
  instantiateNextTsPlugin,
  isUnstableRetryPluginFalsePositive,
  loadNextTsErrorCodes,
  loadNextTsPlugin,
  NextPluginLoadError,
} from "./next-diagnostics-core";

// The known-good NEXT_TS_ERRORS shape as of Next.js 16.2.11
// (node_modules/next/dist/server/typescript/constant.js), used to build
// fabricated module objects below without touching the real Next.js module.
const VALID_NEXT_TS_ERRORS = {
  INVALID_SERVER_API: 71001,
  INVALID_ENTRY_EXPORT: 71002,
  INVALID_OPTION_VALUE: 71003,
  MISPLACED_ENTRY_DIRECTIVE: 71004,
  INVALID_PAGE_PROP: 71005,
  INVALID_CONFIG_OPTION: 71006,
  INVALID_CLIENT_ENTRY_PROP: 71007,
  INVALID_METADATA_EXPORT: 71008,
  INVALID_ERROR_COMPONENT: 71009,
  INVALID_ENTRY_DIRECTIVE: 71010,
  INVALID_SERVER_ENTRY_RETURN: 71011,
};

describe("instantiateNextTsPlugin", () => {
  it("throws NextPluginLoadError when createTSPlugin is missing", () => {
    expect(() => instantiateNextTsPlugin({}, {}, {}, "16.2.11")).toThrow(
      NextPluginLoadError,
    );
  });

  it("throws NextPluginLoadError when createTSPlugin throws during init", () => {
    const mod = {
      createTSPlugin: () => {
        throw new Error("boom");
      },
    };
    expect(() => instantiateNextTsPlugin(mod, {}, {}, "16.2.11")).toThrow(
      NextPluginLoadError,
    );
  });

  it("throws NextPluginLoadError when the instance has no getSemanticDiagnostics", () => {
    const mod = {
      createTSPlugin: () => ({ create: () => ({}) }),
    };
    expect(() => instantiateNextTsPlugin(mod, {}, {}, "16.2.11")).toThrow(
      NextPluginLoadError,
    );
  });

  it("returns the plugin instance on a well-formed module", () => {
    const fakePlugin = { getSemanticDiagnostics: () => [] };
    const mod = {
      createTSPlugin: () => ({ create: () => fakePlugin }),
    };
    expect(instantiateNextTsPlugin(mod, {}, {}, "16.2.11")).toBe(fakePlugin);
  });
});

// These two exercise loadNextTsPlugin/loadNextTsErrorCodes against the real,
// installed next/dist/server/next-typescript.js and
// next/dist/server/typescript/constant.js modules (not a fabricated one) —
// an integration smoke test that doubles as a canary for real drift after a
// Next.js upgrade, complementing the fabricated-module unit tests above.
describe("loadNextTsPlugin (real Next.js module)", () => {
  it("fails loudly, not silently, when given a malformed typescript/info argument", async () => {
    // A well-formed `typescript`/`info` pair is exercised end-to-end by
    // `pnpm run diagnostics` itself; this asserts the failure path — that a
    // real but unusable argument surfaces as NextPluginLoadError with the
    // Next.js version, never a silent empty-diagnostics success.
    await expect(loadNextTsPlugin({}, {}, "16.2.11")).rejects.toBeInstanceOf(
      NextPluginLoadError,
    );
    await expect(loadNextTsPlugin({}, {}, "16.2.11")).rejects.toThrow(
      /16\.2\.11/,
    );
  });
});

describe("extractNextTsErrorCodes", () => {
  it("throws when NEXT_TS_ERRORS is missing", () => {
    expect(() => extractNextTsErrorCodes({}, "16.2.11")).toThrow(
      NextPluginLoadError,
    );
  });

  it("throws when a code value is not an integer", () => {
    const mod = { NEXT_TS_ERRORS: { INVALID_SERVER_API: "71001" } };
    expect(() => extractNextTsErrorCodes(mod, "16.2.11")).toThrow(
      NextPluginLoadError,
    );
  });

  it("throws when NEXT_TS_ERRORS is empty", () => {
    expect(() =>
      extractNextTsErrorCodes({ NEXT_TS_ERRORS: {} }, "16.2.11"),
    ).toThrow(NextPluginLoadError);
  });

  it("derives the code set and byName lookup from a well-formed module, with no drift warning", () => {
    const result = extractNextTsErrorCodes(
      { NEXT_TS_ERRORS: VALID_NEXT_TS_ERRORS },
      "16.2.11",
    );
    expect(result.codes.has(71007)).toBe(true);
    expect(result.codes.size).toBe(11);
    expect(result.byName.INVALID_CLIENT_ENTRY_PROP).toBe(71007);
    expect(result.driftWarning).toBeNull();
  });

  it("surfaces a drift warning (without failing) when Next adds a new code", () => {
    const result = extractNextTsErrorCodes(
      {
        NEXT_TS_ERRORS: { ...VALID_NEXT_TS_ERRORS, INVALID_NEW_THING: 71012 },
      },
      "17.0.0",
    );
    expect(result.codes.has(71012)).toBe(true);
    expect(result.driftWarning).toMatch(/INVALID_NEW_THING/);
  });

  it("surfaces a drift warning when a known code disappears", () => {
    const withoutOne = Object.fromEntries(
      Object.entries(VALID_NEXT_TS_ERRORS).filter(
        ([name]) => name !== "INVALID_SERVER_API",
      ),
    );
    const result = extractNextTsErrorCodes(
      { NEXT_TS_ERRORS: withoutOne },
      "17.0.0",
    );
    expect(result.driftWarning).toMatch(/INVALID_SERVER_API/);
  });
});

describe("loadNextTsErrorCodes (real Next.js module)", () => {
  it("resolves the known Next-plugin diagnostic codes from the installed Next.js", async () => {
    const result = await loadNextTsErrorCodes("16.2.11");
    expect(result.codes.has(71007)).toBe(true);
    expect(result.byName.INVALID_CLIENT_ENTRY_PROP).toBe(71007);
    // No drift expected against the currently pinned Next.js version — a
    // failure here means NEXT_TS_ERRORS changed and
    // KNOWN_NEXT_TS_ERROR_NAMES needs updating.
    expect(result.driftWarning).toBeNull();
  });
});

describe("isUnstableRetryPluginFalsePositive", () => {
  const invalidClientEntryPropCode = 71007;
  const message = 'Prop "unstable_retry" is not allowed in a client boundary.';

  it("matches error.tsx with the exact code and message", () => {
    expect(
      isUnstableRetryPluginFalsePositive(
        { code: 71007, fileName: "src/app/error.tsx", message },
        invalidClientEntryPropCode,
      ),
    ).toBe(true);
  });

  it("matches global-error.tsx", () => {
    expect(
      isUnstableRetryPluginFalsePositive(
        { code: 71007, fileName: "src/app/global-error.tsx", message },
        invalidClientEntryPropCode,
      ),
    ).toBe(true);
  });

  it("does not match other files, even with the same code and message", () => {
    expect(
      isUnstableRetryPluginFalsePositive(
        { code: 71007, fileName: "src/app/page.tsx", message },
        invalidClientEntryPropCode,
      ),
    ).toBe(false);
  });

  it("does not match a different diagnostic code on error.tsx", () => {
    expect(
      isUnstableRetryPluginFalsePositive(
        { code: 71001, fileName: "src/app/error.tsx", message },
        invalidClientEntryPropCode,
      ),
    ).toBe(false);
  });

  it("does not match error.tsx for an unrelated prop", () => {
    expect(
      isUnstableRetryPluginFalsePositive(
        {
          code: 71007,
          fileName: "src/app/error.tsx",
          message: 'Prop "someOtherProp" is not allowed in a client boundary.',
        },
        invalidClientEntryPropCode,
      ),
    ).toBe(false);
  });

  it("never matches when the code name was not found in NEXT_TS_ERRORS (undefined)", () => {
    expect(
      isUnstableRetryPluginFalsePositive(
        { code: 71007, fileName: "src/app/error.tsx", message },
        undefined,
      ),
    ).toBe(false);
  });
});

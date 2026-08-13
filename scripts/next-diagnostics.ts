#!/usr/bin/env tsx
/**
 * Runs the Next.js TypeScript language-service plugin (the same "next"
 * plugin VS Code loads via tsconfig.json's `compilerOptions.plugins`) as a
 * standalone check. These diagnostics — disallowed server-component APIs,
 * invalid entry-file exports, non-serializable client-boundary props,
 * misplaced/redundant "use client"/"use server" directives, invalid
 * metadata exports — only run inside a `ts.LanguageService`. Both
 * `tsc --noEmit` and `next build`'s own type check call
 * `ts.createProgram(...).emit()` directly (see
 * node_modules/next/dist/lib/typescript/runTypeCheck.js), which never
 * loads language-service plugins, so this category is otherwise invisible
 * outside the editor.
 *
 * This depends on Next.js internal (non-public-API) modules that can move
 * or change shape across upgrades — see scripts/lib/next-diagnostics-core.ts
 * for the load-failure handling that keeps that from silently degrading to
 * "zero diagnostics found".
 */
import ts from "typescript";
import path from "node:path";
import {
  getInstalledNextVersion,
  isUnstableRetryPluginFalsePositive,
  loadNextTsErrorCodes,
  loadNextTsPlugin,
  NextPluginLoadError,
} from "./lib/next-diagnostics-core";

async function main() {
  const nextVersion = getInstalledNextVersion();
  const projectRoot = process.cwd();

  const configPath = ts.findConfigFile(
    projectRoot,
    ts.sys.fileExists,
    "tsconfig.json",
  );
  if (!configPath) {
    console.error("[next-diagnostics] could not find tsconfig.json");
    process.exit(1);
  }

  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    projectRoot,
  );

  const host: ts.LanguageServiceHost = {
    ...ts.sys,
    getScriptFileNames: () => parsed.fileNames,
    getScriptVersion: () => "0",
    getScriptSnapshot: (fileName) => {
      const contents = ts.sys.readFile(fileName);
      return contents === undefined
        ? undefined
        : ts.ScriptSnapshot.fromString(contents);
    },
    getCurrentDirectory: () => projectRoot,
    getCompilationSettings: () => parsed.options,
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
  };

  const languageService = ts.createLanguageService(
    host,
    ts.createDocumentRegistry(),
  );

  // Minimal stand-in for tsserver's `PluginCreateInfo` — the plugin only
  // touches `info.project.getCurrentDirectory()` and
  // `info.project.projectService.logger.info(...)` outside of
  // `info.languageService`/`info.languageServiceHost`.
  const info = {
    languageService,
    languageServiceHost: host,
    project: {
      getCurrentDirectory: () => projectRoot,
      projectService: { logger: { info: () => {} } },
    },
    config: {},
  } as unknown as ts.server.PluginCreateInfo;

  const proxy = await loadNextTsPlugin(ts, info, nextVersion);
  const {
    codes: nextTsErrorCodes,
    byName,
    driftWarning,
  } = await loadNextTsErrorCodes(nextVersion);
  if (driftWarning) {
    console.warn(driftWarning);
  }
  const invalidClientEntryPropCode = byName.INVALID_CLIENT_ENTRY_PROP;

  const scannedFiles = parsed.fileNames.filter(
    (fileName) =>
      /\.(ts|tsx)$/.test(fileName) &&
      !fileName.includes(`${path.sep}node_modules${path.sep}`) &&
      !fileName.startsWith(path.join(projectRoot, ".next") + path.sep),
  );

  type Finding = {
    file: string;
    line: number;
    character: number;
    category: string;
    message: string;
  };

  const findings: Finding[] = [];

  for (const fileName of scannedFiles) {
    for (const diagnostic of proxy.getSemanticDiagnostics(fileName)) {
      if (
        typeof diagnostic.code !== "number" ||
        !nextTsErrorCodes.has(diagnostic.code)
      ) {
        continue;
      }
      const message = ts.flattenDiagnosticMessageText(
        diagnostic.messageText as ts.DiagnosticMessageChain | string,
        "\n",
      );
      if (
        isUnstableRetryPluginFalsePositive(
          { code: diagnostic.code, fileName, message },
          invalidClientEntryPropCode,
        )
      ) {
        continue;
      }
      const category =
        diagnostic.category === ts.DiagnosticCategory.Error
          ? "error"
          : "warning";
      const diagnosticFile = diagnostic.file as ts.SourceFile | undefined;
      if (diagnosticFile && typeof diagnostic.start === "number") {
        const { line, character } =
          diagnosticFile.getLineAndCharacterOfPosition(diagnostic.start);
        findings.push({
          file: path.relative(projectRoot, diagnosticFile.fileName),
          line: line + 1,
          character: character + 1,
          category,
          message,
        });
      } else {
        findings.push({
          file: path.relative(projectRoot, fileName),
          line: 0,
          character: 0,
          category,
          message,
        });
      }
    }
  }

  if (findings.length === 0) {
    console.log(
      `[next-diagnostics] OK — no Next.js TS plugin diagnostics across ${scannedFiles.length} file(s).`,
    );
    process.exit(0);
  }

  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

  console.error(
    `[next-diagnostics] FAILED — ${findings.length} Next.js TypeScript plugin diagnostic(s):\n`,
  );
  for (const finding of findings) {
    console.error(
      `  ${finding.file}:${finding.line}:${finding.character} - ${finding.category}: ${finding.message}`,
    );
  }
  process.exit(1);
}

main().catch((error: unknown) => {
  if (error instanceof NextPluginLoadError) {
    console.error(`[next-diagnostics] FAILED — ${error.message}`);
    if (error.cause) {
      console.error(
        `[next-diagnostics] cause: ${error.cause instanceof Error ? (error.cause.stack ?? error.cause.message) : String(error.cause)}`,
      );
    }
  } else {
    console.error("[next-diagnostics] FAILED — unexpected error:", error);
  }
  process.exit(1);
});

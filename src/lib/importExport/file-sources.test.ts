import { describe, expect, it } from "vitest";
import {
  extractTextFromImportFile,
  extractRecipesFromArchiveFile,
  extractDishFromJsonFile,
  getImportFileKind,
  validateArchiveImportFile,
  MAX_IMPORT_FILE_SIZE_BYTES,
  MAX_ARCHIVE_IMPORT_FILE_SIZE_BYTES,
} from "@/lib/importExport/file-sources";
import {
  buildRecipeMetadataBplist,
  buildRgrBuffer,
  buildZipArchive,
} from "@/lib/importExport/__fixtures__/recipe-gallery-fixtures";

function makeFile(name: string, content: string, type = "text/plain"): File {
  return new File([content], name, { type });
}

describe("extractTextFromImportFile", () => {
  it("reads a .txt file's text", async () => {
    const result = await extractTextFromImportFile(
      makeFile("recipe.txt", "Tacos\n1 lb beef"),
    );
    expect(result).toEqual({ status: "success", text: "Tacos\n1 lb beef" });
  });

  it("reads a .md file's text", async () => {
    const result = await extractTextFromImportFile(
      makeFile("recipe.md", "# Tacos\n\n- 1 lb beef", "text/markdown"),
    );
    expect(result).toEqual({
      status: "success",
      text: "# Tacos\n\n- 1 lb beef",
    });
  });

  it("rejects an unsupported extension", async () => {
    const result = await extractTextFromImportFile(
      makeFile("recipe.pdf", "%PDF-1.4", "application/pdf"),
    );
    expect(result.status).toBe("error");
  });

  it("rejects an empty file", async () => {
    const result = await extractTextFromImportFile(makeFile("recipe.txt", ""));
    expect(result.status).toBe("error");
  });

  it("rejects a whitespace-only file", async () => {
    const result = await extractTextFromImportFile(
      makeFile("recipe.txt", "   \n\n  "),
    );
    expect(result.status).toBe("error");
  });

  it("rejects a file over the size limit", async () => {
    const oversized = "x".repeat(MAX_IMPORT_FILE_SIZE_BYTES + 1);
    const result = await extractTextFromImportFile(
      makeFile("recipe.txt", oversized),
    );
    expect(result.status).toBe("error");
  });

  it("is case-insensitive about the extension", async () => {
    const result = await extractTextFromImportFile(
      makeFile("RECIPE.MD", "# Tacos"),
    );
    expect(result.status).toBe("success");
  });

  it("rejects a .rga file — it routes through the archive path instead", async () => {
    const result = await extractTextFromImportFile(
      makeFile("export.rga", "PK\x03\x04", "application/octet-stream"),
    );
    expect(result.status).toBe("error");
  });
});

describe("getImportFileKind", () => {
  it("classifies .md and .txt as text", () => {
    expect(getImportFileKind("recipe.md")).toBe("text");
    expect(getImportFileKind("recipe.txt")).toBe("text");
  });

  it("classifies .rga as archive", () => {
    expect(getImportFileKind("export.rga")).toBe("archive");
    expect(getImportFileKind("EXPORT.RGA")).toBe("archive");
  });

  it("classifies anything else as unsupported", () => {
    expect(getImportFileKind("recipe.pdf")).toBe("unsupported");
    expect(getImportFileKind("recipe")).toBe("unsupported");
  });

  it("classifies .json as dishframeJson", () => {
    expect(getImportFileKind("export.json")).toBe("dishframeJson");
    expect(getImportFileKind("EXPORT.JSON")).toBe("dishframeJson");
  });
});

describe("validateArchiveImportFile", () => {
  it("accepts a well-formed .rga selection", () => {
    const result = validateArchiveImportFile(
      makeFile("export.rga", "PK\x03\x04", "application/octet-stream"),
    );
    expect(result).toEqual({ status: "ok" });
  });

  it("rejects a non-.rga extension", () => {
    const result = validateArchiveImportFile(makeFile("recipe.txt", "hi"));
    expect(result.status).toBe("error");
  });

  it("rejects an empty .rga file", () => {
    const result = validateArchiveImportFile(makeFile("export.rga", ""));
    expect(result.status).toBe("error");
  });

  it("rejects a .rga file over the size limit", () => {
    const file = makeFile("export.rga", "x");
    Object.defineProperty(file, "size", {
      value: MAX_ARCHIVE_IMPORT_FILE_SIZE_BYTES + 1,
    });
    const result = validateArchiveImportFile(file);
    expect(result.status).toBe("error");
  });
});

describe("extractRecipesFromArchiveFile", () => {
  // Direction correction (importer hardening pass): `.rga` extraction runs
  // entirely client-side now — this is the new `File` → bytes → archive
  // parser entrypoint (recipe-gallery-import.ts's own parsing logic is
  // covered in depth by recipe-gallery-import.test.ts against raw buffers;
  // this only confirms the `File` plumbing above it wires the bytes through
  // correctly, since nothing else exercises that specific hop).
  it("reads a real .rga File's bytes and extracts its recipe", async () => {
    const metadata = buildRecipeMetadataBplist({
      title: "File Source Test Recipe",
      categories: [],
      text: "INGREDIENTS:\n\n1 cup flour\n\nINSTRUCTIONS:\n\nMix it.",
    });
    const archive = buildZipArchive([
      { name: "AAAA.rgr", data: buildRgrBuffer(metadata) },
    ]);
    const file = new File([Uint8Array.from(archive)], "export.rga", {
      type: "application/octet-stream",
    });

    const result = await extractRecipesFromArchiveFile(file);
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.drafts).toHaveLength(1);
    const draft = result.drafts[0];
    expect(draft.status).toBe("ok");
    if (draft.status !== "ok") return;
    expect(draft.result.values.title).toBe("File Source Test Recipe");
  });

  it("rejects an oversized .rga File before reading its bytes", async () => {
    const file = makeFile("export.rga", "x");
    Object.defineProperty(file, "size", {
      value: MAX_ARCHIVE_IMPORT_FILE_SIZE_BYTES + 1,
    });
    const result = await extractRecipesFromArchiveFile(file);
    expect(result.status).toBe("error");
  });
});

// Task §1: `dishframe-json-import.ts` owns the actual shape recognition —
// this only confirms the `File` → text → JSON.parse plumbing above it, the
// same division of labor `extractRecipesFromArchiveFile`'s own tests above
// keep with `recipe-gallery-import.test.ts`.
describe("extractDishFromJsonFile", () => {
  it("reads and normalizes a real DishFrame dish-export File", async () => {
    const exportJson = {
      format: "dishframe.dish-export",
      formatVersion: 2,
      kind: "RECIPE",
      title: "File Source JSON Recipe",
      stage: "IDEA",
      cuisine: null,
      tags: [],
      flavorProfiles: [],
      versions: [
        {
          title: "File Source JSON Recipe",
          sections: [
            {
              ingredients: [{ name: "Salt" }],
              instructions: [{ text: "Season to taste." }],
            },
          ],
        },
      ],
    };
    const file = makeFile(
      "recipe-export.json",
      JSON.stringify(exportJson),
      "application/json",
    );

    const result = await extractDishFromJsonFile(file);
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.drafts).toHaveLength(1);
    const draft = result.drafts[0];
    expect(draft.status).toBe("ok");
    if (draft.status !== "ok") return;
    expect(draft.result.values.title).toBe("File Source JSON Recipe");
  });

  it("fails gracefully on a file that isn't valid JSON", async () => {
    const file = makeFile("recipe-export.json", "{not valid json");
    const result = await extractDishFromJsonFile(file);
    expect(result.status).toBe("error");
  });

  it("fails gracefully on valid JSON that isn't a DishFrame export", async () => {
    const file = makeFile(
      "recipe-export.json",
      JSON.stringify({ hello: "world" }),
    );
    const result = await extractDishFromJsonFile(file);
    expect(result.status).toBe("error");
  });

  it("rejects an empty file", async () => {
    const result = await extractDishFromJsonFile(
      makeFile("recipe-export.json", ""),
    );
    expect(result.status).toBe("error");
  });
});

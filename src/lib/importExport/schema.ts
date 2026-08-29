import { z } from "zod";
import { dishKindValues } from "@/lib/dishes/schema";

// PRODUCT_SPEC.md §59.1: pasted recipe text — Apple Notes, recipe websites,
// messages, plain-text files, other personal documents. A generous ceiling
// (not a realistic recipe length) rather than a meaningful limit.
export const proposeImportFromPasteSchema = z.object({
  rawText: z.string().trim().min(1, "Paste some recipe text first.").max(20000),
});

// Website import: a raw URL string, validated for shape here — the
// SSRF-sensitive protocol/destination checks happen server-side in
// `url-fetch.ts`, not in this schema.
export const proposeImportFromUrlSchema = z.object({
  url: z.string().trim().min(1, "Enter a recipe URL.").max(2000),
});

export const confirmImportSchema = z.object({
  kind: z.enum(dishKindValues),
});

export type ActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};
export const initialActionState: ActionState = { status: "idle" };

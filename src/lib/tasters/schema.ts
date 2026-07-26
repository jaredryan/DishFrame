import { z } from "zod";

// PRODUCT_SPEC.md §34.1: reusable named Tasters, owner-scoped.
export const tasterNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a name.")
  .max(60, "Name is too long.");

export const createTasterSchema = z.object({
  name: tasterNameSchema,
});

export const renameTasterSchema = z.object({
  id: z.string().min(1),
  name: tasterNameSchema,
});

export const tasterIdSchema = z.object({
  id: z.string().min(1),
});

export type ActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export const initialActionState: ActionState = { status: "idle" };

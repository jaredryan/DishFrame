import { z } from "zod";

// Mirrors UserPreference's enum columns exactly (prisma/schema.prisma) —
// PRODUCT_SPEC.md §49.1, §88.1, §92.3.
export const preferencesFormSchema = z.object({
  measurementSystem: z.enum(["US", "METRIC"]),
  fractionOrDecimal: z.enum(["FRACTIONS", "DECIMALS"]),
  primaryRatingDisplay: z.enum(["GROUP_AVERAGE", "YOUR_RATING"]),
  timerSoundEnabled: z.boolean(),
  reviewPromptEnabled: z.boolean(),
});

export type PreferencesFormValues = z.infer<typeof preferencesFormSchema>;
export type PrimaryRatingDisplayValue =
  PreferencesFormValues["primaryRatingDisplay"];

export type PreferencesFormState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export const initialPreferencesFormState: PreferencesFormState = {
  status: "idle",
};

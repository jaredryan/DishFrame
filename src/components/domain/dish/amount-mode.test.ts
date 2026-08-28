import { describe, expect, it } from "vitest";
import { amountModeShowsUnit, deriveAmountMode } from "@/components/domain/dish/amount-mode";

describe("amountModeShowsUnit", () => {
  it("shows Unit only for a structured quantity (single or range)", () => {
    expect(amountModeShowsUnit("single")).toBe(true);
    expect(amountModeShowsUnit("range")).toBe(true);
  });

  it("hides Unit for To taste, As needed, and free text — none has a quantity to attach it to", () => {
    expect(amountModeShowsUnit("to_taste")).toBe(false);
    expect(amountModeShowsUnit("as_needed")).toBe(false);
    expect(amountModeShowsUnit("free_text")).toBe(false);
  });
});

describe("deriveAmountMode", () => {
  it("recognizes the To taste and As needed presets by their exact text", () => {
    expect(deriveAmountMode({ displayText: "To taste" })).toBe("to_taste");
    expect(deriveAmountMode({ displayText: "As needed" })).toBe("as_needed");
  });
});

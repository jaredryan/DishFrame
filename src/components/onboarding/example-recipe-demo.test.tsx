import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExampleRecipeDemo } from "@/components/onboarding/example-recipe-demo";

// PRODUCT_SPEC.md §92.4: this demo must never be able to write to the
// user's real library "under any circumstance" — BUILD_PLAN.md Slice 20
// calls for a dedicated negative test, since a leak here would be a
// visible, embarrassing bug. A static import-boundary check plus a
// mocked-persistence interaction check both guard against it.
describe("ExampleRecipeDemo isolation", () => {
  it("never imports prisma, a dish Server Action, or any domain service", () => {
    const source = readFileSync(
      path.join(__dirname, "example-recipe-demo.tsx"),
      "utf-8",
    );
    const forbidden = [
      "@/lib/db/prisma",
      "@/lib/dishes/actions",
      "@/lib/dishes/service",
      "@/generated/prisma",
      "prisma.",
    ];
    for (const token of forbidden) {
      expect(source).not.toContain(token);
    }
  });

  it("never calls a mocked persistence function while being interacted with", async () => {
    const createDish = vi.fn();
    const editDish = vi.fn();
    vi.doMock("@/lib/dishes/actions", () => ({ createDish, editDish }));

    const user = userEvent.setup();
    render(<ExampleRecipeDemo />);

    await user.click(screen.getByRole("button", { name: "V1.0" }));
    await user.click(screen.getByRole("button", { name: "V2.0" }));
    await user.click(screen.getByRole("button", { name: "Show linked Part" }));
    await user.click(screen.getByRole("button", { name: "Hide linked Part" }));

    expect(createDish).not.toHaveBeenCalled();
    expect(editDish).not.toHaveBeenCalled();
    expect(screen.getByText("example — not saved")).toBeInTheDocument();
  });
});

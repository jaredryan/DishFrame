import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ClosingCta } from "@/components/marketing/closing-cta";

describe("ClosingCta", () => {
  it("routes the call to action to the logged-in home page", () => {
    render(<ClosingCta heading="Heading" description="Description" />);

    expect(
      screen.getByRole("link", { name: /create your first recipe/i }),
    ).toHaveAttribute("href", "/home");
  });
});

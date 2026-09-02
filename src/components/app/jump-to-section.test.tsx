import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { JumpToSection } from "@/components/app/jump-to-section";

describe("JumpToSection", () => {
  it("renders a link for each entry, in order, pointing at its section anchor", () => {
    render(
      <JumpToSection
        links={[
          { label: "Appearance", href: "#appearance" },
          { label: "Cuisines", href: "#cuisines" },
        ]}
      />,
    );

    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "Appearance",
      "Cuisines",
    ]);
    expect(links[0]).toHaveAttribute("href", "#appearance");
    expect(links[1]).toHaveAttribute("href", "#cuisines");
  });
});

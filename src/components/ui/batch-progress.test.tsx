import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  BatchProgressDialog,
  BatchProgressIndicator,
} from "@/components/ui/batch-progress";

describe("BatchProgressIndicator", () => {
  it("renders honest determinate progress with its label", () => {
    render(
      <BatchProgressIndicator
        progress={{ percent: 40, label: "2 / 5 items" }}
      />,
    );
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "40");
    expect(screen.getByText("2 / 5 items")).toBeInTheDocument();
  });

  it("renders an indeterminate pulse without a fabricated percentage when progress is null", () => {
    render(<BatchProgressIndicator progress={null} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).not.toHaveAttribute("aria-valuenow");
  });
});

describe("BatchProgressDialog", () => {
  it("is not dismissible while open — no close button", () => {
    render(
      <BatchProgressDialog
        open
        title="Importing…"
        progress={{ percent: 10 }}
      />,
    );
    expect(screen.getByText("Importing…")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /close/i }),
    ).not.toBeInTheDocument();
  });
});

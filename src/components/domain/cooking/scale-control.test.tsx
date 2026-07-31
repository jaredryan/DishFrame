import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ScaleControl,
  computeOutputBasis,
} from "@/components/domain/cooking/scale-control";

/**
 * PRODUCT_SPEC.md §24.1/§24.2 — natural target-output scaling. Covers the
 * two Slice 8 closeout paths: a usable "Makes" basis computes the
 * multiplier internally from a target output the user types (never asking
 * them to compute it), and the plain-multiplier fallback when no useful
 * authored output exists (§24.2's "must not require servings for a sauce").
 */
describe("ScaleControl", () => {
  it("computes the multiplier from a target output against a usable Makes basis", async () => {
    const user = userEvent.setup();
    const onMultiplierChange = vi.fn();
    render(
      <ScaleControl
        outputQuantity={4}
        outputUnit="servings"
        onMultiplierChange={onMultiplierChange}
      />,
    );

    expect(screen.getByText(/makes 4 servings/i)).toBeInTheDocument();
    await user.type(screen.getByRole("textbox"), "8");

    expect(onMultiplierChange).toHaveBeenLastCalledWith(2);
  });

  it("supports any authored output label, not only servings", () => {
    render(
      <ScaleControl
        outputQuantity={12}
        outputUnit="cookies"
        onMultiplierChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/makes 12 cookies/i)).toBeInTheDocument();
  });

  it("falls back to a plain multiplier when no useful output basis exists", async () => {
    const user = userEvent.setup();
    const onMultiplierChange = vi.fn();
    render(
      <ScaleControl
        outputQuantity={null}
        outputUnit={null}
        onMultiplierChange={onMultiplierChange}
      />,
    );

    expect(screen.queryByText(/makes/i)).not.toBeInTheDocument();
    await user.type(screen.getByRole("textbox"), "3");

    expect(onMultiplierChange).toHaveBeenLastCalledWith(3);
  });

  it("reports null while the field is blank", () => {
    const onMultiplierChange = vi.fn();
    render(
      <ScaleControl
        outputQuantity={null}
        outputUnit={null}
        onMultiplierChange={onMultiplierChange}
      />,
    );
    expect(onMultiplierChange).not.toHaveBeenCalled();
  });
});

/**
 * Slice 8 scaling cleanup — `currentMultiplier` puts the control into "safe"
 * mode for mid-session scaling: prefilled with the current scale, blank
 * input never silently changes it, and Reset is an explicit, visible action.
 */
describe("ScaleControl safe mode (currentMultiplier)", () => {
  it("prefills the target output that produces the current scale", () => {
    render(
      <ScaleControl
        outputQuantity={2}
        outputUnit="cups"
        currentMultiplier={1.5}
        onMultiplierChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("textbox")).toHaveValue("3");
  });

  it("prefills the current plain multiplier when there is no output basis", () => {
    render(
      <ScaleControl
        outputQuantity={null}
        outputUnit={null}
        currentMultiplier={1.5}
        onMultiplierChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("textbox")).toHaveValue("1.5");
  });

  it("never calls onMultiplierChange when submitted unchanged", () => {
    const onMultiplierChange = vi.fn();
    render(
      <ScaleControl
        outputQuantity={2}
        outputUnit="cups"
        currentMultiplier={1.5}
        onMultiplierChange={onMultiplierChange}
      />,
    );
    expect(onMultiplierChange).not.toHaveBeenCalled();
  });

  it("does not reset the pending value when the field is cleared to blank", async () => {
    const user = userEvent.setup();
    const onMultiplierChange = vi.fn();
    render(
      <ScaleControl
        outputQuantity={2}
        outputUnit="cups"
        currentMultiplier={1.5}
        onMultiplierChange={onMultiplierChange}
      />,
    );
    await user.clear(screen.getByRole("textbox"));
    expect(onMultiplierChange).not.toHaveBeenCalled();
  });

  it("Reset to authored amount shows and applies the resulting authored value", async () => {
    const user = userEvent.setup();
    const onMultiplierChange = vi.fn();
    render(
      <ScaleControl
        outputQuantity={2}
        outputUnit="cups"
        currentMultiplier={1.5}
        onMultiplierChange={onMultiplierChange}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /reset to authored amount/i }),
    );
    expect(screen.getByRole("textbox")).toHaveValue("2");
    expect(onMultiplierChange).toHaveBeenLastCalledWith(null);
  });

  it("Reset to authored amount works for the plain-multiplier fallback too", async () => {
    const user = userEvent.setup();
    const onMultiplierChange = vi.fn();
    render(
      <ScaleControl
        outputQuantity={null}
        outputUnit={null}
        currentMultiplier={2}
        onMultiplierChange={onMultiplierChange}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /reset to authored amount/i }),
    );
    expect(screen.getByRole("textbox")).toHaveValue("1");
    expect(onMultiplierChange).toHaveBeenLastCalledWith(null);
  });

  it("Setup (no currentMultiplier) keeps resetting to authored on blank", async () => {
    const user = userEvent.setup();
    const onMultiplierChange = vi.fn();
    render(
      <ScaleControl
        outputQuantity={2}
        outputUnit="cups"
        onMultiplierChange={onMultiplierChange}
      />,
    );
    await user.type(screen.getByRole("textbox"), "3");
    await user.clear(screen.getByRole("textbox"));
    expect(onMultiplierChange).toHaveBeenLastCalledWith(null);
    expect(
      screen.queryByRole("button", { name: /reset to authored amount/i }),
    ).not.toBeInTheDocument();
  });
});

/**
 * Slice 8 scaling cleanup — a linked Part's authored yield is a relative
 * amount: the default target output composes it with the whole-session
 * scale (PRODUCT_SPEC.md §24.4), which is what lets a target-output edit on
 * a Part derive a *relative* unit factor instead of an absolute one.
 */
describe("computeOutputBasis", () => {
  it("composes the authored yield with the current session scale for a yielded Part", () => {
    expect(computeOutputBasis(2, 2)).toBe(4);
    expect(computeOutputBasis(2, 1)).toBe(2);
  });

  it("returns null when there is no authored yield, for the multiplier fallback", () => {
    expect(computeOutputBasis(null, 2)).toBeNull();
  });
});

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OnboardingProvider } from "@/components/onboarding/onboarding-provider";
import { CoachMark } from "@/components/onboarding/coach-mark";

const mockMarkOnboardingGuideState = vi.fn();
vi.mock("@/lib/preferences/actions", () => ({
  markOnboardingGuideState: (...args: unknown[]) =>
    mockMarkOnboardingGuideState(...args),
  resetOnboardingGuideState: vi.fn(),
}));

describe("CoachMark", () => {
  beforeEach(() => {
    mockMarkOnboardingGuideState.mockClear();
  });

  it("renders when the guide has no recorded status", () => {
    render(
      <OnboardingProvider initialState={{}}>
        <CoachMark guideKey="parts-intro" title="Reusable Parts">
          body text
        </CoachMark>
      </OnboardingProvider>,
    );
    expect(screen.getByText("Reusable Parts")).toBeInTheDocument();
  });

  it("does not render once the guide is already completed or dismissed", () => {
    render(
      <OnboardingProvider initialState={{ "parts-intro": "dismissed" }}>
        <CoachMark guideKey="parts-intro" title="Reusable Parts">
          body text
        </CoachMark>
      </OnboardingProvider>,
    );
    expect(screen.queryByText("Reusable Parts")).not.toBeInTheDocument();
  });

  it("'Got it' hides the guide and persists completed status", async () => {
    const user = userEvent.setup();
    render(
      <OnboardingProvider initialState={{}}>
        <CoachMark guideKey="parts-intro" title="Reusable Parts">
          body text
        </CoachMark>
      </OnboardingProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Got it" }));

    expect(screen.queryByText("Reusable Parts")).not.toBeInTheDocument();
    expect(mockMarkOnboardingGuideState).toHaveBeenCalledWith(
      "parts-intro",
      "completed",
    );
  });

  it("dismiss hides the guide and persists dismissed status", async () => {
    const user = userEvent.setup();
    render(
      <OnboardingProvider initialState={{}}>
        <CoachMark guideKey="parts-intro" title="Reusable Parts">
          body text
        </CoachMark>
      </OnboardingProvider>,
    );

    await user.click(
      screen.getByRole("button", { name: "Dismiss: Reusable Parts" }),
    );

    expect(screen.queryByText("Reusable Parts")).not.toBeInTheDocument();
    expect(mockMarkOnboardingGuideState).toHaveBeenCalledWith(
      "parts-intro",
      "dismissed",
    );
  });

  // Slice 20 hardening pass: the four newly registered guides (Meal Plans,
  // Grocery Lists, Sharing, Tasters) use this exact same generic mechanism
  // — no per-key branching in CoachMark itself — so this proves each one
  // specifically appears when incomplete and hides once recorded, rather
  // than relying only on the "parts-intro" coverage above.
  it.each([
    ["meal-plans-intro", "Meal Plans"],
    ["grocery-lists-intro", "Grocery Lists"],
    ["sharing-intro", "Sharing"],
    ["tasters-intro", "Tasters"],
  ] as const)(
    "%s appears when incomplete, hidden once recorded",
    (guideKey, title) => {
      const { unmount } = render(
        <OnboardingProvider initialState={{}}>
          <CoachMark guideKey={guideKey} title={title}>
            body text
          </CoachMark>
        </OnboardingProvider>,
      );
      expect(screen.getByText(title)).toBeInTheDocument();
      unmount();

      render(
        <OnboardingProvider initialState={{ [guideKey]: "completed" }}>
          <CoachMark guideKey={guideKey} title={title}>
            body text
          </CoachMark>
        </OnboardingProvider>,
      );
      expect(screen.queryByText(title)).not.toBeInTheDocument();
    },
  );
});

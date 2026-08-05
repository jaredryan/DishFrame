import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OnboardingProvider } from "@/components/onboarding/onboarding-provider";
import { ReplayableGuideList } from "@/components/onboarding/replayable-guide-list";
import { ONBOARDING_GUIDE_INFO } from "@/lib/preferences/onboarding-guides";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const mockResetOnboardingGuideState = vi.fn();
vi.mock("@/lib/preferences/actions", () => ({
  markOnboardingGuideState: vi.fn(),
  resetOnboardingGuideState: (...args: unknown[]) =>
    mockResetOnboardingGuideState(...args),
}));

describe("ReplayableGuideList", () => {
  beforeEach(() => {
    push.mockClear();
    mockResetOnboardingGuideState.mockClear();
  });

  it("lists every registered guide, including the Slice 20 hardening additions", () => {
    render(
      <OnboardingProvider initialState={{}}>
        <ReplayableGuideList />
      </OnboardingProvider>,
    );

    for (const key of [
      "meal-plans-intro",
      "grocery-lists-intro",
      "sharing-intro",
      "tasters-intro",
    ] as const) {
      expect(
        screen.getByText(ONBOARDING_GUIDE_INFO[key].title),
      ).toBeInTheDocument();
    }
  });

  it("replaying a guide resets it and navigates to where it appears", async () => {
    const user = userEvent.setup();
    render(
      <OnboardingProvider initialState={{ "meal-plans-intro": "completed" }}>
        <ReplayableGuideList />
      </OnboardingProvider>,
    );

    const row = screen.getByText("Meal Plans").closest("li");
    if (!row) throw new Error("Meal Plans row not found");
    await user.click(within(row).getByRole("button", { name: "Replay" }));

    expect(mockResetOnboardingGuideState).toHaveBeenCalledWith(
      "meal-plans-intro",
    );
    expect(push).toHaveBeenCalledWith(
      ONBOARDING_GUIDE_INFO["meal-plans-intro"].href,
    );
  });
});

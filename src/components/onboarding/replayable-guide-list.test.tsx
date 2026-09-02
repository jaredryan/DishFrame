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
const mockMarkOnboardingGuideState = vi.fn();
vi.mock("@/lib/preferences/actions", () => ({
  markOnboardingGuideState: (...args: unknown[]) =>
    mockMarkOnboardingGuideState(...args),
  resetOnboardingGuideState: (...args: unknown[]) =>
    mockResetOnboardingGuideState(...args),
}));

describe("ReplayableGuideList", () => {
  beforeEach(() => {
    push.mockClear();
    mockResetOnboardingGuideState.mockClear();
    mockMarkOnboardingGuideState.mockClear();
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

  it("shows Play for an incomplete guide and Replay for a completed one", () => {
    render(
      <OnboardingProvider initialState={{ "meal-plans-intro": "completed" }}>
        <ReplayableGuideList />
      </OnboardingProvider>,
    );

    const mealPlansRow = screen.getByText("Meal Plans").closest("li");
    const tastersRow = screen.getByText("Tasters").closest("li");
    if (!mealPlansRow || !tastersRow) throw new Error("Row not found");

    expect(
      within(mealPlansRow).getByRole("button", {
        name: "Replay Meal Plans guide",
      }),
    ).toBeInTheDocument();
    expect(
      within(tastersRow).getByRole("button", { name: "Play Tasters guide" }),
    ).toBeInTheDocument();
  });

  it("clicking Play/Replay resets guide state and navigates to where it appears", async () => {
    const user = userEvent.setup();
    render(
      <OnboardingProvider initialState={{ "meal-plans-intro": "completed" }}>
        <ReplayableGuideList />
      </OnboardingProvider>,
    );

    const row = screen.getByText("Meal Plans").closest("li");
    if (!row) throw new Error("Meal Plans row not found");
    await user.click(
      within(row).getByRole("button", { name: "Replay Meal Plans guide" }),
    );

    expect(mockResetOnboardingGuideState).toHaveBeenCalledWith(
      "meal-plans-intro",
    );
    expect(push).toHaveBeenCalledWith(
      ONBOARDING_GUIDE_INFO["meal-plans-intro"].href,
    );
  });

  it("checking the completion checkbox marks the guide completed without navigating", async () => {
    const user = userEvent.setup();
    render(
      <OnboardingProvider initialState={{}}>
        <ReplayableGuideList />
      </OnboardingProvider>,
    );

    const row = screen.getByText("Tasters").closest("li");
    if (!row) throw new Error("Tasters row not found");
    await user.click(
      within(row).getByRole("checkbox", { name: "Tasters guide completed" }),
    );

    expect(mockMarkOnboardingGuideState).toHaveBeenCalledWith(
      "tasters-intro",
      "completed",
    );
    expect(push).not.toHaveBeenCalled();
    expect(
      within(row).getByRole("button", { name: "Replay Tasters guide" }),
    ).toBeInTheDocument();
  });

  it("unchecking the completion checkbox resets guide state", async () => {
    const user = userEvent.setup();
    render(
      <OnboardingProvider initialState={{ "tasters-intro": "completed" }}>
        <ReplayableGuideList />
      </OnboardingProvider>,
    );

    const row = screen.getByText("Tasters").closest("li");
    if (!row) throw new Error("Tasters row not found");
    await user.click(
      within(row).getByRole("checkbox", { name: "Tasters guide completed" }),
    );

    expect(mockResetOnboardingGuideState).toHaveBeenCalledWith("tasters-intro");
    expect(push).not.toHaveBeenCalled();
  });

  it("does not trigger Play/Replay when clicking elsewhere on the card", async () => {
    const user = userEvent.setup();
    render(
      <OnboardingProvider initialState={{}}>
        <ReplayableGuideList />
      </OnboardingProvider>,
    );

    const row = screen.getByText("Tasters").closest("li");
    if (!row) throw new Error("Tasters row not found");
    await user.click(
      within(row).getByText(ONBOARDING_GUIDE_INFO["tasters-intro"].description),
    );

    expect(push).not.toHaveBeenCalled();
    expect(mockResetOnboardingGuideState).not.toHaveBeenCalled();
    expect(mockMarkOnboardingGuideState).not.toHaveBeenCalled();
  });
});

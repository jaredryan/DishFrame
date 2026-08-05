import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import {
  OnboardingProvider,
  useOnboarding,
} from "@/components/onboarding/onboarding-provider";

function Probe() {
  useOnboarding();
  return null;
}

describe("useOnboarding", () => {
  it("throws a clear error when rendered outside an OnboardingProvider", () => {
    // Silence the expected React error-boundary console noise for this one
    // deliberately-throwing render.
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(
      "useOnboarding must be used within an OnboardingProvider",
    );
    consoleError.mockRestore();
  });

  it("does not throw when a real OnboardingProvider is an ancestor", () => {
    expect(() =>
      render(
        <OnboardingProvider initialState={{}}>
          <Probe />
        </OnboardingProvider>,
      ),
    ).not.toThrow();
  });
});

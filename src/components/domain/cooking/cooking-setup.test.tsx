import type { ComponentProps } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  CookingSetup,
  type SetupUnit,
} from "@/components/domain/cooking/cooking-setup";

const push = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/recipes/dish-1/cook",
  useSearchParams: () => mockSearchParams,
}));

vi.mock("@/lib/cooking/actions", () => ({
  startCookingSession: vi.fn(),
  endCookingSession: vi.fn(),
}));

const UNITS: SetupUnit[] = [
  {
    unitKey: "section-1",
    kind: "SECTION",
    label: "Prep",
    estimatedDurationMinutes: null,
    ingredientCount: 2,
    instructionCount: 1,
    outputQuantity: null,
    outputUnit: null,
    parentPartLabel: null,
  },
];

const VERSIONS = [
  { id: "v1", majorVersion: 1, minorVersion: 0 },
  { id: "v2", majorVersion: 2, minorVersion: 0 },
];

function renderSetup(
  overrides: Partial<ComponentProps<typeof CookingSetup>> = {},
) {
  return render(
    <CookingSetup
      dishId="dish-1"
      dishVersionId="v1"
      dishTitle="Weeknight Stir-Fry"
      versionLabel="V1.0"
      isCurrent
      currentVersionId="v1"
      versions={VERSIONS}
      units={UNITS}
      sourceOutputQuantity={4}
      sourceOutputUnit="servings"
      cancelHref="/recipes/dish-1"
      {...overrides}
    />,
  );
}

describe("CookingSetup — Version selection drives Whole-session scale content", () => {
  beforeEach(() => {
    push.mockReset();
    mockSearchParams = new URLSearchParams({ from: "home" });
  });

  it("Whole-session scale reflects the currently selected Version's own yield", () => {
    renderSetup({ sourceOutputQuantity: 4, sourceOutputUnit: "servings" });

    expect(screen.getByText(/Makes 4 servings\./)).toBeInTheDocument();
  });

  it("switching the Version picker navigates to that Version (preserving other query params), so the server re-derives Whole-session scale content from it", async () => {
    const user = userEvent.setup();
    renderSetup();

    await user.click(
      screen.getByRole("combobox", { name: "Jump to a major version line" }),
    );
    await user.click(await screen.findByRole("option", { name: "V2.0" }));

    expect(push).toHaveBeenCalledWith(
      "/recipes/dish-1/cook?from=home&versionId=v2",
    );
  });

  it("never shows stale Whole-session scale content from a previously selected Version — a fresh render for the newly selected Version's own yield replaces it entirely", () => {
    // Simulates the page's own `key={version.id}` remount after the
    // server re-fetches content for the newly selected Version — this
    // component itself never patches `sourceOutputQuantity` in place.
    const { unmount } = renderSetup({
      dishVersionId: "v1",
      sourceOutputQuantity: 4,
      sourceOutputUnit: "servings",
    });
    expect(screen.getByText(/Makes 4 servings\./)).toBeInTheDocument();
    unmount();

    renderSetup({
      dishVersionId: "v2",
      versionLabel: "V2.0",
      sourceOutputQuantity: 8,
      sourceOutputUnit: "servings",
    });
    expect(screen.getByText(/Makes 8 servings\./)).toBeInTheDocument();
    expect(screen.queryByText(/Makes 4 servings\./)).not.toBeInTheDocument();
  });
});

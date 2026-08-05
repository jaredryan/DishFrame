import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { render as rtlRender, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionReviewForm } from "@/components/domain/cooking/session-review-form";
import { OnboardingProvider } from "@/components/onboarding/onboarding-provider";
import { saveSessionReview } from "@/lib/reviews/actions";

// SessionReviewForm renders CoachMark, which requires an ancestor
// OnboardingProvider now that useOnboarding() throws without one.
function render(ui: ReactElement) {
  return rtlRender(ui, {
    wrapper: ({ children }) => (
      <OnboardingProvider initialState={{}}>{children}</OnboardingProvider>
    ),
  });
}

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/lib/reviews/actions", () => ({
  saveSessionReview: vi.fn(async () => ({ status: "success", deleted: false })),
  deleteSessionReview: vi.fn(async () => ({ status: "success" })),
}));

vi.mock("@/lib/dishes/actions", () => ({
  updateDishStage: vi.fn(async () => ({ status: "success" })),
}));

const mockedSave = vi.mocked(saveSessionReview);

const baseProps = {
  sessionId: "session-1",
  dishId: "recipe-1",
  dishVersionId: "version-cooked",
  dishKind: "RECIPE" as const,
  dishTitle: "Test Bowl",
  outcome: "COMPLETED" as const,
  contextUnits: [],
  tasterOptions: [],
  existingReview: null,
  existingRatings: [],
  rawElapsedSeconds: null,
  stageSuggestion: null,
};

/**
 * PRODUCT_SPEC.md §39.5 — Edit Recipe/Part must open the editor pinned to
 * the exact cooked Version, not silently default to the current Version.
 */
describe("SessionReviewForm — feedback-assisted editing entry", () => {
  it("links Edit Recipe to the exact cooked Version and this session, after saving", async () => {
    mockedSave.mockClear();
    const user = userEvent.setup();
    render(<SessionReviewForm {...baseProps} />);

    await user.type(screen.getAllByRole("textbox")[0]!, "Turned out great");
    await user.click(screen.getByRole("button", { name: "Save Review" }));

    const editLink = await screen.findByRole("link", { name: /Edit Recipe/ });
    expect(editLink).toHaveAttribute(
      "href",
      "/recipes/recipe-1/edit?versionId=version-cooked&sessionId=session-1",
    );
  });
});

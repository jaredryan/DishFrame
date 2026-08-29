import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { render as rtlRender, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionReviewForm } from "@/components/domain/cooking/session-review-form";
import { OnboardingProvider } from "@/components/onboarding/onboarding-provider";
import { ToastProvider, Toaster } from "@/components/ui/toast";
import { saveSessionReview } from "@/lib/reviews/actions";
import { updateDishStage } from "@/lib/dishes/actions";

// SessionReviewForm renders CoachMark, which requires an ancestor
// OnboardingProvider now that useOnboarding() throws without one, and now
// calls useToast() too.
function render(ui: ReactElement) {
  return rtlRender(ui, {
    wrapper: ({ children }) => (
      <OnboardingProvider initialState={{}}>
        <ToastProvider>
          {children}
          <Toaster />
        </ToastProvider>
      </OnboardingProvider>
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
const mockedUpdateDishStage = vi.mocked(updateDishStage);

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
  currentStage: null,
};

/**
 * PRODUCT_SPEC.md §39.5 — Edit Recipe/Part must open the editor pinned to
 * the exact cooked Version, not silently default to the current Version.
 */
describe("SessionReviewForm — feedback-assisted editing entry", () => {
  it("links Edit recipe to the exact cooked Version and this session, after saving", async () => {
    mockedSave.mockClear();
    const user = userEvent.setup();
    render(<SessionReviewForm {...baseProps} />);

    await user.type(screen.getAllByRole("textbox")[0]!, "Turned out great");
    await user.click(screen.getByRole("button", { name: /Save review/ }));

    const editLink = await screen.findByRole("link", { name: /Edit recipe/ });
    expect(editLink).toHaveAttribute(
      "href",
      "/recipes/recipe-1/edit?versionId=version-cooked&sessionId=session-1",
    );
  });
});

/**
 * Post-cook review redesign item 1 — "This session included" is real
 * multi-select checkboxes, prefilled from the session's own completion
 * state by default, freely overridable, and persisted as the reviewer's
 * own retrospective judgment.
 */
describe("SessionReviewForm — 'This session included' checkboxes", () => {
  const contextUnits = [
    { id: "unit-done", label: "Prep", completed: true },
    { id: "unit-open", label: "Sear", completed: false },
  ];

  it("defaults checked state from the session's own recorded completion, and lets the reviewer override it", async () => {
    mockedSave.mockClear();
    const user = userEvent.setup();
    render(<SessionReviewForm {...baseProps} contextUnits={contextUnits} />);

    const prepCheckbox = screen.getByRole("checkbox", { name: "Prep" });
    const searCheckbox = screen.getByRole("checkbox", { name: "Sear" });
    expect(prepCheckbox).toBeChecked();
    expect(searCheckbox).not.toBeChecked();

    // Override: uncheck the completed unit, check the incomplete one — an
    // ended-early session's retrospective judgment can diverge from
    // DishFrame's own formal completion state.
    await user.click(prepCheckbox);
    await user.click(searCheckbox);
    await user.click(screen.getByRole("button", { name: /Save review/ }));

    expect(mockedSave).toHaveBeenCalledWith(
      expect.objectContaining({ includedUnitIds: ["unit-open"] }),
    );
  });

  it("reopening an existing Review uses its own saved selection rather than recomputing from session completion state", () => {
    render(
      <SessionReviewForm
        {...baseProps}
        contextUnits={contextUnits}
        existingReview={{
          whatWentWell: null,
          whatDidNotGoWell: null,
          anythingElse: null,
          actualAmountQuantity: null,
          actualAmountUnit: null,
          reviewAdjustedDurationSeconds: null,
          // Saved selection disagrees with the session's own completion
          // state (Prep was completed but excluded; Sear was left open but
          // included) — the saved choice must win.
          includedUnitIds: ["unit-open"],
        }}
      />,
    );

    expect(screen.getByRole("checkbox", { name: "Prep" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Sear" })).toBeChecked();
  });
});

/**
 * Post-cook review redesign items 2–4: the success screen centers its
 * content, orders actions Change stage / View+Edit row / Done, uses
 * sentence-style copy, and Done routes to this dish's own Cooking history
 * instead of the global cook log.
 */
describe("SessionReviewForm — post-review success screen", () => {
  it("orders actions Change recipe stage / View recipe+Edit recipe / Done, with sentence-style copy, and Done goes to this Recipe's Cooking history", async () => {
    mockedSave.mockClear();
    const user = userEvent.setup();
    const { container } = render(
      <SessionReviewForm {...baseProps} currentStage="PROVEN" />,
    );

    await user.click(screen.getByRole("button", { name: /Save review/ }));
    await screen.findByRole("heading", { name: "Review saved" });

    expect(
      screen.getByText(
        /Depending on how it went, you can update this recipe.s stage here\./,
      ),
    ).toBeInTheDocument();

    // Stage editor starts collapsed behind its own toggle button.
    expect(screen.queryByLabelText("Recipe stage")).not.toBeInTheDocument();

    const actionLabels = Array.from(
      container.querySelectorAll("button, a"),
    ).map((el) => el.textContent);
    expect(actionLabels).toEqual([
      "Change recipe stage",
      "View recipe",
      "Edit recipe",
      "Done",
    ]);

    const doneLink = screen.getByRole("link", { name: "Done" });
    expect(doneLink).toHaveAttribute("href", "/recipes/recipe-1/history");
    const viewLink = screen.getByRole("link", { name: "View recipe" });
    expect(viewLink).toHaveAttribute("href", "/recipes/recipe-1");
  });

  it("uses Part copy and routes when reviewing a Part", async () => {
    mockedSave.mockClear();
    const user = userEvent.setup();
    render(
      <SessionReviewForm
        {...baseProps}
        dishKind="PART"
        dishId="part-1"
        currentStage="PROVEN"
      />,
    );

    await user.click(screen.getByRole("button", { name: /Save review/ }));
    await screen.findByRole("heading", { name: "Review saved" });

    expect(
      screen.getByText(
        /Depending on how it went, you can update this part.s stage here\./,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Change part stage" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Done" })).toHaveAttribute(
      "href",
      "/parts/part-1/history",
    );
  });

  it("Cancel discards the open Stage editor without saving; Save persists it, collapses back, and shows a success toast for the actually-saved value", async () => {
    mockedSave.mockClear();
    mockedUpdateDishStage.mockClear();
    const user = userEvent.setup();
    render(<SessionReviewForm {...baseProps} currentStage="PROVEN" />);

    await user.click(screen.getByRole("button", { name: /Save review/ }));
    await screen.findByRole("heading", { name: "Review saved" });

    await user.click(
      screen.getByRole("button", { name: "Change recipe stage" }),
    );
    expect(screen.getByLabelText("Recipe stage")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Recipe stage")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Change recipe stage" }),
    ).toBeInTheDocument();
    expect(mockedUpdateDishStage).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "Change recipe stage" }),
    );
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Active" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByText("Stage updated to Active.");
    expect(mockedUpdateDishStage).toHaveBeenCalledWith("RECIPE", {
      dishId: "recipe-1",
      stage: "ACTIVE",
    });
    expect(screen.queryByLabelText("Recipe stage")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Change recipe stage" }),
    ).toBeInTheDocument();
  });

  it("changing the draft dropdown after a save never rewrites the already-shown success toast (save-state bug fix)", async () => {
    mockedSave.mockClear();
    mockedUpdateDishStage.mockClear();
    const user = userEvent.setup();
    render(<SessionReviewForm {...baseProps} currentStage="PROVEN" />);

    await user.click(screen.getByRole("button", { name: /Save review/ }));
    await screen.findByRole("heading", { name: "Review saved" });

    await user.click(
      screen.getByRole("button", { name: "Change recipe stage" }),
    );
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Active" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Stage updated to Active.");

    // Reopen the editor and change the draft dropdown without saving again —
    // the toast reporting the last *actually saved* value must not change.
    await user.click(
      screen.getByRole("button", { name: "Change recipe stage" }),
    );
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Idea" }));

    expect(screen.getByText("Stage updated to Active.")).toBeInTheDocument();
    expect(mockedUpdateDishStage).toHaveBeenCalledTimes(1);
  });
});

import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  render as rtlRender,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  CookingModeShell,
  type CookingModeUnit,
} from "@/components/domain/cooking/cooking-mode-shell";
import { OnboardingProvider } from "@/components/onboarding/onboarding-provider";
import {
  toggleChecklistItem,
  updateSessionScale,
  startTimer,
  endCookingSession,
} from "@/lib/cooking/actions";

// CookingModeShell renders CoachMark, which requires an ancestor
// OnboardingProvider now that useOnboarding() throws without one.
function render(ui: ReactElement) {
  return rtlRender(ui, {
    wrapper: ({ children }) => (
      <OnboardingProvider initialState={{}}>{children}</OnboardingProvider>
    ),
  });
}

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

vi.mock("@/lib/cooking/actions", () => ({
  toggleChecklistItem: vi.fn(async () => ({ status: "success" })),
  setUnitCompletion: vi.fn(async () => ({ status: "success" })),
  updateSessionScale: vi.fn(async () => ({ status: "success" })),
  updateUnitScale: vi.fn(async () => ({ status: "success" })),
  createTimer: vi.fn(async () => ({ status: "success" })),
  renameTimer: vi.fn(async () => ({ status: "success" })),
  startTimer: vi.fn(async () => ({ status: "success" })),
  pauseTimer: vi.fn(async () => ({ status: "success" })),
  resetTimer: vi.fn(async () => ({ status: "success" })),
  adjustTimer: vi.fn(async () => ({ status: "success" })),
  dismissTimer: vi.fn(async () => ({ status: "success" })),
  endCookingSession: vi.fn(async () => ({ status: "success" })),
  addSessionUnits: vi.fn(async () => ({ status: "success" })),
  removeSessionUnit: vi.fn(async () => ({ status: "success" })),
  restoreSessionUnit: vi.fn(async () => ({ status: "success" })),
  reorderSessionUnits: vi.fn(async () => ({ status: "success" })),
  deleteCookingSession: vi.fn(async () => ({ status: "success" })),
}));

vi.mock("@/lib/reviews/actions", () => ({
  updateCookingNotes: vi.fn(async () => ({ status: "success" })),
}));

const mockedToggle = vi.mocked(toggleChecklistItem);
const mockedUpdateSessionScale = vi.mocked(updateSessionScale);
const mockedStartTimer = vi.mocked(startTimer);
const mockedEndCookingSession = vi.mocked(endCookingSession);

function unit(overrides: Partial<CookingModeUnit>): CookingModeUnit {
  return {
    id: "unit-1",
    label: "Prep",
    sourceDishTitle: "Test Bowl",
    sourceDishVersionLabel: "V1",
    removedAt: null,
    removedAfterProgress: false,
    completedAt: null,
    scaleFactor: 1,
    outputQuantity: null,
    outputUnit: null,
    checklistItems: [],
    timers: [],
    ...overrides,
  };
}

const baseProps = {
  sessionId: "session-1",
  state: "IN_PROGRESS" as const,
  isActive: true,
  startedAt: new Date().toISOString(),
  endedAt: null,
  dishId: "dish-1",
  dishTitle: "Test Bowl",
  dishKind: "RECIPE" as const,
  versionLabel: "V1",
  versionImageAssetId: null,
  addableUnits: [],
  sessionScaleFactor: 1,
  sourceOutputQuantity: null,
  sourceOutputUnit: null,
  timerSoundEnabled: true,
  cookingNotes: null,
  hasReview: false,
};

/**
 * jsdom applies no CSS, so both the mobile (`lg:hidden`) and desktop
 * (`hidden lg:flex`) trees are always present in the DOM — only a real
 * browser's media query hides one of them (verified visually, not here).
 * Every query below is scoped through the desktop tree's own landmarks
 * (`nav`/`main`/`aside`) so it never collides with the mobile tree's
 * duplicate content; this suite exercises the shared state/handlers via
 * the desktop redesign this pass introduces (PRODUCT_SPEC.md §28,
 * desktop Cooking Mode redesign items 1–11).
 */
function desktopNav() {
  return screen.getByRole("navigation", { name: /cooking navigation/i });
}
function desktopMain() {
  return screen.getByRole("main");
}
function desktopRail() {
  return screen.getByRole("complementary", { name: /active timers/i });
}

/** Desktop now opens on the Recipe overview by default (refinement pass
 * item 1), so any test that needs a Section's own content must navigate
 * there first via the left nav. */
async function gotoSection(
  user: ReturnType<typeof userEvent.setup>,
  name: string | RegExp,
) {
  await user.click(within(desktopNav()).getByRole("button", { name }));
}

describe("CookingModeShell — desktop navigation", () => {
  it("selects a Section in one click, showing only that Section's content in the center panel", async () => {
    const user = userEvent.setup();
    const units: CookingModeUnit[] = [
      unit({
        id: "unit-1",
        label: "Prep",
        checklistItems: [
          {
            id: "item-1",
            kind: "INGREDIENT",
            displayText: "Rice",
            displayQuantity: "2",
            displayUnit: "cups",
            checkedAt: null,
            conflict: null,
          },
        ],
      }),
      unit({
        id: "unit-2",
        label: "Sauce",
        checklistItems: [
          {
            id: "item-2",
            kind: "INGREDIENT",
            displayText: "Soy sauce",
            displayQuantity: "1",
            displayUnit: "tbsp",
            checkedAt: null,
            conflict: null,
          },
        ],
      }),
    ];

    render(<CookingModeShell {...baseProps} units={units} />);
    const main = desktopMain();

    await gotoSection(user, /Prep/);
    expect(
      within(main).getByRole("heading", { name: "Prep" }),
    ).toBeInTheDocument();
    expect(within(main).getByText(/Rice/)).toBeInTheDocument();
    expect(within(main).queryByText(/Soy sauce/)).not.toBeInTheDocument();

    await user.click(
      within(desktopNav()).getByRole("button", { name: /Sauce/ }),
    );

    expect(
      within(main).getByRole("heading", { name: "Sauce" }),
    ).toBeInTheDocument();
    expect(within(main).getByText(/Soy sauce/)).toBeInTheDocument();
    expect(within(main).queryByText(/^Rice/)).not.toBeInTheDocument();
  });

  it("opens on the Recipe destination by default, listing Sections at the bottom to navigate into", async () => {
    const user = userEvent.setup();
    const units: CookingModeUnit[] = [
      unit({ id: "unit-1", label: "Prep" }),
      unit({ id: "unit-2", label: "Sauce" }),
    ];
    render(<CookingModeShell {...baseProps} units={units} />);
    const main = desktopMain();

    // Default destination is the Recipe overview, not a Section (item 1) —
    // its session-level actions are visible immediately, no click needed.
    expect(
      within(main).getByRole("heading", { name: "Test Bowl" }),
    ).toBeInTheDocument();
    expect(
      within(main).getByRole("button", { name: "End cooking" }),
    ).toBeInTheDocument();

    // The Recipe overview also lists Sections at the bottom, as another
    // way to navigate into one besides the left nav.
    await user.click(within(main).getByRole("button", { name: /Sauce/ }));
    expect(
      within(main).getByRole("heading", { name: "Sauce" }),
    ).toBeInTheDocument();
  });

  it("does not surface Part/Section provenance as a cooking-time distinction", async () => {
    const user = userEvent.setup();
    const units: CookingModeUnit[] = [
      unit({
        id: "unit-1",
        label: "Sauce",
        sourceDishTitle: "Linked Sauce Recipe",
        sourceDishVersionLabel: "V2.0",
      }),
    ];
    render(<CookingModeShell {...baseProps} units={units} />);
    const main = desktopMain();

    await gotoSection(user, /Sauce/);
    expect(
      within(main).getByRole("heading", { name: "Sauce" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Linked Sauce Recipe/)).not.toBeInTheDocument();
    expect(screen.queryByText(/V2\.0/)).not.toBeInTheDocument();
  });
});

describe("CookingModeShell — instant checkbox feedback and persistence", () => {
  it("checks the box immediately from local state, then persists via a debounced toggleChecklistItem call", async () => {
    const user = userEvent.setup();
    const units: CookingModeUnit[] = [
      unit({
        checklistItems: [
          {
            id: "item-1",
            kind: "INGREDIENT",
            displayText: "Rice",
            displayQuantity: "2",
            displayUnit: "cups",
            checkedAt: null,
            conflict: null,
          },
        ],
      }),
    ];

    render(<CookingModeShell {...baseProps} units={units} />);
    await gotoSection(user, /Prep/);
    const checkbox = within(desktopMain()).getByRole("checkbox");

    await user.click(checkbox);

    // Instant: checked before the (mocked, debounced) persistence call has
    // necessarily resolved — no `waitFor` needed for the visual state.
    expect(checkbox).toBeChecked();

    await waitFor(() =>
      expect(mockedToggle).toHaveBeenCalledWith({
        sessionId: "session-1",
        itemId: "item-1",
        checked: true,
      }),
    );
  });

  it("disables checkoffs once the session has ended", async () => {
    const user = userEvent.setup();
    const units: CookingModeUnit[] = [
      unit({
        checklistItems: [
          {
            id: "item-1",
            kind: "INGREDIENT",
            displayText: "Rice",
            displayQuantity: "2",
            displayUnit: "cups",
            checkedAt: new Date().toISOString(),
            conflict: null,
          },
        ],
      }),
    ];

    render(
      <CookingModeShell
        {...baseProps}
        state="COMPLETED"
        isActive={false}
        units={units}
      />,
    );
    await gotoSection(user, /Prep/);

    expect(within(desktopMain()).getByRole("checkbox")).toBeDisabled();
  });
});

describe("CookingModeShell — progress is Instructions-only", () => {
  function progressFixture(): CookingModeUnit[] {
    return [
      unit({
        id: "unit-1",
        label: "Prep",
        checklistItems: [
          {
            id: "ing-1",
            kind: "INGREDIENT",
            displayText: "Rice",
            displayQuantity: "2",
            displayUnit: "cups",
            checkedAt: null,
            conflict: null,
          },
          {
            id: "ing-2",
            kind: "INGREDIENT",
            displayText: "Ginger",
            displayQuantity: "1",
            displayUnit: "tbsp",
            checkedAt: null,
            conflict: null,
          },
          {
            id: "inst-1",
            kind: "INSTRUCTION",
            displayText: "Rinse the rice",
            displayQuantity: null,
            displayUnit: null,
            checkedAt: null,
            conflict: null,
          },
          {
            id: "inst-2",
            kind: "INSTRUCTION",
            displayText: "Simmer for 15 minutes",
            displayQuantity: null,
            displayUnit: null,
            checkedAt: null,
            conflict: null,
          },
        ],
      }),
    ];
  }

  it("does not advance Section progress when Ingredients are checked, only when Instructions are", async () => {
    const user = userEvent.setup();
    render(<CookingModeShell {...baseProps} units={progressFixture()} />);
    const nav = desktopNav();
    const main = desktopMain();
    await gotoSection(user, /Prep/);

    expect(within(nav).getByText("0/2")).toBeInTheDocument();

    await user.click(within(main).getByRole("checkbox", { name: /Rice/ }));
    await user.click(within(main).getByRole("checkbox", { name: /Ginger/ }));

    // Both Ingredients checked — Section progress in the nav is unchanged.
    expect(within(nav).getByText("0/2")).toBeInTheDocument();

    await user.click(
      within(main).getByRole("checkbox", { name: /Rinse the rice/ }),
    );

    expect(within(nav).getByText("1/2")).toBeInTheDocument();
  });
});

describe("CookingModeShell — collapsible Ingredients", () => {
  function ingredientsFixture(): CookingModeUnit[] {
    return [
      unit({
        checklistItems: [
          {
            id: "ing-1",
            kind: "INGREDIENT",
            displayText: "Rice",
            displayQuantity: "2",
            displayUnit: "cups",
            checkedAt: null,
            conflict: null,
          },
          {
            id: "ing-2",
            kind: "INGREDIENT",
            displayText: "Ginger",
            displayQuantity: "1",
            displayUnit: "tbsp",
            checkedAt: null,
            conflict: null,
          },
        ],
      }),
    ];
  }

  it("expands and collapses independently of Instructions, showing its own prep count", async () => {
    const user = userEvent.setup();
    render(<CookingModeShell {...baseProps} units={ingredientsFixture()} />);
    const main = desktopMain();
    await gotoSection(user, /Prep/);

    expect(within(main).getByText(/Rice/)).toBeInTheDocument();
    expect(
      within(main).getByRole("heading", { name: /ingredients/i }),
    ).toHaveTextContent("Ingredients — 0/2");
    const collapseToggle = within(main).getByRole("button", {
      name: /collapse ingredients/i,
    });

    await user.click(collapseToggle);
    expect(within(main).queryByText(/Rice/)).not.toBeInTheDocument();

    await user.click(
      within(main).getByRole("button", { name: /expand ingredients/i }),
    );
    expect(within(main).getByText(/Rice/)).toBeInTheDocument();
  });

  it("'Mark all completed' checks every Ingredient and collapses the group, then becomes 'Reset list'", async () => {
    const user = userEvent.setup();
    render(<CookingModeShell {...baseProps} units={ingredientsFixture()} />);
    const main = desktopMain();
    await gotoSection(user, /Prep/);

    await user.click(
      within(main).getByRole("button", { name: /mark all completed/i }),
    );

    expect(within(main).queryByText(/Rice/)).not.toBeInTheDocument();
    expect(
      within(main).getByRole("heading", { name: /ingredients/i }),
    ).toHaveTextContent("Ingredients — 2/2");

    await waitFor(() =>
      expect(mockedToggle).toHaveBeenCalledWith({
        sessionId: "session-1",
        itemId: "ing-1",
        checked: true,
      }),
    );
    await waitFor(() =>
      expect(mockedToggle).toHaveBeenCalledWith({
        sessionId: "session-1",
        itemId: "ing-2",
        checked: true,
      }),
    );

    // All complete — the same control persists as a reset action rather
    // than disappearing (item 4 of the header/control refinement pass),
    // and stays clickable even while the list itself is collapsed.
    await user.click(within(main).getByRole("button", { name: /reset list/i }));

    await waitFor(() =>
      expect(mockedToggle).toHaveBeenCalledWith({
        sessionId: "session-1",
        itemId: "ing-1",
        checked: false,
      }),
    );
    await waitFor(() =>
      expect(mockedToggle).toHaveBeenCalledWith({
        sessionId: "session-1",
        itemId: "ing-2",
        checked: false,
      }),
    );
    expect(
      within(main).getByRole("heading", { name: /ingredients/i }),
    ).toHaveTextContent("Ingredients — 0/2");
  });

  it("does not auto-collapse when the last Ingredient is checked individually", async () => {
    const user = userEvent.setup();
    render(<CookingModeShell {...baseProps} units={ingredientsFixture()} />);
    const main = desktopMain();
    await gotoSection(user, /Prep/);

    await user.click(within(main).getByRole("checkbox", { name: /Rice/ }));
    await user.click(within(main).getByRole("checkbox", { name: /Ginger/ }));

    // Still expanded — checking the final item is not a collapse trigger.
    expect(within(main).getByText(/Rice/)).toBeInTheDocument();
    expect(within(main).getByText(/Ginger/)).toBeInTheDocument();
  });
});

describe("CookingModeShell — collapsible Instructions", () => {
  function instructionsFixture(): CookingModeUnit[] {
    return [
      unit({
        checklistItems: [
          {
            id: "inst-1",
            kind: "INSTRUCTION",
            displayText: "Rinse the rice",
            displayQuantity: null,
            displayUnit: null,
            checkedAt: null,
            conflict: null,
          },
          {
            id: "inst-2",
            kind: "INSTRUCTION",
            displayText: "Simmer for 15 minutes",
            displayQuantity: null,
            displayUnit: null,
            checkedAt: null,
            conflict: null,
          },
        ],
      }),
    ];
  }

  it("expands and collapses independently of Ingredients, showing its own progress", async () => {
    const user = userEvent.setup();
    render(<CookingModeShell {...baseProps} units={instructionsFixture()} />);
    const main = desktopMain();
    await gotoSection(user, /Prep/);

    expect(within(main).getByText(/Rinse the rice/)).toBeInTheDocument();
    expect(
      within(main).getByRole("heading", { name: /instructions/i }),
    ).toHaveTextContent("Instructions — 0/2");
    const collapseToggle = within(main).getByRole("button", {
      name: /collapse instructions/i,
    });

    await user.click(collapseToggle);
    expect(within(main).queryByText(/Rinse the rice/)).not.toBeInTheDocument();

    await user.click(
      within(main).getByRole("button", { name: /expand instructions/i }),
    );
    expect(within(main).getByText(/Rinse the rice/)).toBeInTheDocument();
  });

  it("'Mark all completed' checks every Instruction and collapses the group, then becomes 'Reset list'", async () => {
    const user = userEvent.setup();
    render(<CookingModeShell {...baseProps} units={instructionsFixture()} />);
    const main = desktopMain();
    await gotoSection(user, /Prep/);

    await user.click(
      within(main).getByRole("button", { name: /mark all completed/i }),
    );

    expect(within(main).queryByText(/Rinse the rice/)).not.toBeInTheDocument();
    expect(
      within(main).getByRole("heading", { name: /instructions/i }),
    ).toHaveTextContent("Instructions — 2/2");

    await waitFor(() =>
      expect(mockedToggle).toHaveBeenCalledWith({
        sessionId: "session-1",
        itemId: "inst-1",
        checked: true,
      }),
    );
    await waitFor(() =>
      expect(mockedToggle).toHaveBeenCalledWith({
        sessionId: "session-1",
        itemId: "inst-2",
        checked: true,
      }),
    );

    // All complete — the same control persists as a reset action rather
    // than disappearing, and stays clickable even while the list itself is
    // collapsed (mirrors Ingredients' behavior).
    await user.click(within(main).getByRole("button", { name: /reset list/i }));

    await waitFor(() =>
      expect(mockedToggle).toHaveBeenCalledWith({
        sessionId: "session-1",
        itemId: "inst-1",
        checked: false,
      }),
    );
    await waitFor(() =>
      expect(mockedToggle).toHaveBeenCalledWith({
        sessionId: "session-1",
        itemId: "inst-2",
        checked: false,
      }),
    );
    expect(
      within(main).getByRole("heading", { name: /instructions/i }),
    ).toHaveTextContent("Instructions — 0/2");
  });

  it("does not auto-collapse when the final Instruction is checked individually", async () => {
    const user = userEvent.setup();
    render(<CookingModeShell {...baseProps} units={instructionsFixture()} />);
    const main = desktopMain();
    await gotoSection(user, /Prep/);

    await user.click(
      within(main).getByRole("checkbox", { name: /Rinse the rice/ }),
    );
    await user.click(
      within(main).getByRole("checkbox", { name: /Simmer for 15 minutes/ }),
    );

    // Still expanded — checking the final item is not a collapse trigger.
    expect(within(main).getByText(/Rinse the rice/)).toBeInTheDocument();
    expect(within(main).getByText(/Simmer for 15 minutes/)).toBeInTheDocument();
  });
});

describe("CookingModeShell — desktop timer rail", () => {
  function timerFixture(): CookingModeUnit[] {
    return [
      unit({
        id: "unit-1",
        label: "Prep",
        timers: [
          {
            id: "timer-1",
            name: "Rice",
            durationSeconds: 600,
            targetEndAt: null,
            remainingSeconds: 300,
            state: "PAUSED",
          },
        ],
      }),
      unit({
        id: "unit-2",
        label: "Sauce",
        checklistItems: [],
        timers: [],
      }),
    ];
  }

  it("keeps a Section's active timer visible and controllable in the rail after switching to another Section", async () => {
    const user = userEvent.setup();
    render(<CookingModeShell {...baseProps} units={timerFixture()} />);

    expect(within(desktopRail()).getByText(/Rice/)).toBeInTheDocument();

    await user.click(
      within(desktopNav()).getByRole("button", { name: /Sauce/ }),
    );

    // Rail is independent of the selected Section (design item 5).
    const riceRow = within(desktopRail())
      .getByText(/Rice/)
      .closest("li") as HTMLElement;
    expect(riceRow).toBeInTheDocument();

    await user.click(
      within(riceRow).getByRole("button", { name: /start timer/i }),
    );
    await waitFor(() =>
      expect(mockedStartTimer).toHaveBeenCalledWith({
        sessionId: "session-1",
        timerId: "timer-1",
      }),
    );
  });

  it("does not surface timer state on the owning Section's nav item (timers live only in the rail)", () => {
    render(<CookingModeShell {...baseProps} units={timerFixture()} />);
    const prepNavItem = within(desktopNav()).getByRole("button", {
      name: /Prep/,
    });
    expect(within(prepNavItem).queryByText("5:00")).not.toBeInTheDocument();
  });
});

describe("CookingModeShell — scaling dialogs (retargeted to the desktop tree)", () => {
  /**
   * Slice 8 scaling cleanup: the mid-session scale dialogs used to leave
   * their input blank and reset scale to authored on an unedited Save. The
   * dialog now prefills with the current scale, so an unedited Save must
   * preserve it exactly.
   */
  it("saves the current whole-session scale unchanged when the dialog is submitted without editing", async () => {
    const user = userEvent.setup();
    render(
      <CookingModeShell
        {...baseProps}
        sessionScaleFactor={2}
        units={[unit({})]}
      />,
    );
    const main = desktopMain();

    // "Scale session" lives in the Recipe destination, not the Section. The
    // Recipe-root nav button sits above the scrollable `<nav>` list (sticky
    // header), so it's queried unscoped rather than via desktopNav().
    await user.click(screen.getByRole("button", { name: "Test Bowl" }));
    await user.click(
      within(main).getByRole("button", { name: /scale session/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /save scale change/i }),
    );

    expect(mockedUpdateSessionScale).toHaveBeenCalledWith({
      sessionId: "session-1",
      scaleFactor: 2,
    });
  });

  /**
   * PRODUCT_SPEC.md §24.4: a Part's own scale is relative to the whole
   * session's scale, not absolute — Session ×2 with the unit's own ×1.5
   * yields ×3 effective, and the default target output composes both.
   */
  it("composes session and unit scale multiplicatively for a yielded Part", async () => {
    const user = userEvent.setup();
    const units: CookingModeUnit[] = [
      unit({
        id: "unit-1",
        label: "Sauce",
        scaleFactor: 1.5,
        outputQuantity: 2,
        outputUnit: "cups",
      }),
    ];

    render(
      <CookingModeShell {...baseProps} sessionScaleFactor={2} units={units} />,
    );
    await gotoSection(user, /Sauce/);

    await user.click(
      within(desktopMain()).getByRole("button", { name: "Scale" }),
    );

    expect(screen.getByText("Session ×2")).toBeInTheDocument();
    expect(screen.getByText("This unit ×1.5")).toBeInTheDocument();
    expect(screen.getByText("Effective ×3")).toBeInTheDocument();
    // Cooking notes' own textarea also has role "textbox" — scope to the
    // open scale dialog, which contains exactly one.
    expect(within(screen.getByRole("dialog")).getByRole("textbox")).toHaveValue(
      "6",
    );
  });
});

describe("CookingModeShell — End cooking", () => {
  it("offers four outcomes, and 'Keep cooking' dismisses without ending the session", async () => {
    const user = userEvent.setup();
    render(<CookingModeShell {...baseProps} units={[unit({})]} />);

    await user.click(
      within(desktopMain()).getByRole("button", { name: "End cooking" }),
    );

    const dialog = screen.getByRole("dialog", { name: /end cooking\?/i });
    expect(
      within(dialog).getByRole("button", { name: "Keep cooking" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Leave & resume later" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "End early" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Finish session" }),
    ).toBeInTheDocument();

    await user.click(
      within(dialog).getByRole("button", { name: "Keep cooking" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mockedEndCookingSession).not.toHaveBeenCalled();
  });

  it("'Leave & resume later' leaves Cooking Mode without ending the session", async () => {
    const user = userEvent.setup();
    render(<CookingModeShell {...baseProps} units={[unit({})]} />);

    await user.click(
      within(desktopMain()).getByRole("button", { name: "End cooking" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Leave & resume later" }),
    );

    expect(push).toHaveBeenCalledWith("/recipes/dish-1/history");
    expect(mockedEndCookingSession).not.toHaveBeenCalled();
  });

  it("'End early' ends the session with partial progress preserved", async () => {
    const user = userEvent.setup();
    render(<CookingModeShell {...baseProps} units={[unit({})]} />);

    await user.click(
      within(desktopMain()).getByRole("button", { name: "End cooking" }),
    );
    await user.click(screen.getByRole("button", { name: "End early" }));

    await waitFor(() =>
      expect(mockedEndCookingSession).toHaveBeenCalledWith({
        sessionId: "session-1",
        outcome: "ENDED_EARLY",
      }),
    );
  });

  it("'Finish session' ends the session as completed", async () => {
    const user = userEvent.setup();
    render(<CookingModeShell {...baseProps} units={[unit({})]} />);

    await user.click(
      within(desktopMain()).getByRole("button", { name: "End cooking" }),
    );
    await user.click(screen.getByRole("button", { name: "Finish session" }));

    await waitFor(() =>
      expect(mockedEndCookingSession).toHaveBeenCalledWith({
        sessionId: "session-1",
        outcome: "COMPLETED",
      }),
    );
  });
});

describe("CookingModeShell — leave-page warning bypass", () => {
  /**
   * Refinement pass item 1: the browser's own beforeunload confirmation is
   * the fallback for departures DishFrame can't replace with its own modal
   * (refresh, closing the tab, browser back/forward, a typed URL) — it
   * should still fire on its own. But an explicit End-cooking outcome
   * already asked the user what they want, so that specific programmatic
   * navigation must not also trigger it.
   */
  function runningTimerUnits(): CookingModeUnit[] {
    return [
      unit({
        timers: [
          {
            id: "timer-1",
            name: "Rice",
            durationSeconds: 600,
            targetEndAt: new Date(Date.now() + 600_000).toISOString(),
            remainingSeconds: 600,
            state: "RUNNING",
          },
        ],
      }),
    ];
  }

  function dispatchBeforeUnload(): boolean {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  }

  it("still shows the browser leave warning while a timer runs and no explicit End-cooking outcome has been chosen", () => {
    render(<CookingModeShell {...baseProps} units={runningTimerUnits()} />);
    expect(dispatchBeforeUnload()).toBe(true);
  });

  it("bypasses the browser leave warning after 'Leave & resume later'", async () => {
    const user = userEvent.setup();
    render(<CookingModeShell {...baseProps} units={runningTimerUnits()} />);

    await user.click(
      within(desktopMain()).getByRole("button", { name: "End cooking" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Leave & resume later" }),
    );

    expect(dispatchBeforeUnload()).toBe(false);
  });

  it("bypasses the browser leave warning after 'End early'", async () => {
    const user = userEvent.setup();
    render(<CookingModeShell {...baseProps} units={runningTimerUnits()} />);

    await user.click(
      within(desktopMain()).getByRole("button", { name: "End cooking" }),
    );
    await user.click(screen.getByRole("button", { name: "End early" }));

    await waitFor(() => expect(mockedEndCookingSession).toHaveBeenCalled());
    expect(dispatchBeforeUnload()).toBe(false);
  });

  it("bypasses the browser leave warning after 'Finish session'", async () => {
    const user = userEvent.setup();
    render(<CookingModeShell {...baseProps} units={runningTimerUnits()} />);

    await user.click(
      within(desktopMain()).getByRole("button", { name: "End cooking" }),
    );
    await user.click(screen.getByRole("button", { name: "Finish session" }));

    await waitFor(() => expect(mockedEndCookingSession).toHaveBeenCalled());
    expect(dispatchBeforeUnload()).toBe(false);
  });

  it("does not bypass the warning when ending the session fails", async () => {
    mockedEndCookingSession.mockResolvedValueOnce({
      status: "error",
      message: "Could not end this session.",
    });
    const user = userEvent.setup();
    render(<CookingModeShell {...baseProps} units={runningTimerUnits()} />);

    await user.click(
      within(desktopMain()).getByRole("button", { name: "End cooking" }),
    );
    await user.click(screen.getByRole("button", { name: "End early" }));

    await waitFor(() => expect(mockedEndCookingSession).toHaveBeenCalled());
    expect(dispatchBeforeUnload()).toBe(true);
  });
});

describe("CookingModeShell — checklist items keep their position", () => {
  it("does not reorder a checked Instruction to the bottom of the list", async () => {
    const user = userEvent.setup();
    const units: CookingModeUnit[] = [
      unit({
        checklistItems: [
          {
            id: "inst-1",
            kind: "INSTRUCTION",
            displayText: "First step",
            displayQuantity: null,
            displayUnit: null,
            checkedAt: null,
            conflict: null,
          },
          {
            id: "inst-2",
            kind: "INSTRUCTION",
            displayText: "Second step",
            displayQuantity: null,
            displayUnit: null,
            checkedAt: null,
            conflict: null,
          },
        ],
      }),
    ];
    render(<CookingModeShell {...baseProps} units={units} />);
    await gotoSection(user, /Prep/);
    const main = desktopMain();

    await user.click(
      within(main).getByRole("checkbox", { name: /First step/ }),
    );

    const items = within(main)
      .getAllByRole("listitem")
      .filter((el) => /step/i.test(el.textContent ?? ""));
    expect(items[0]).toHaveTextContent("First step");
    expect(items[1]).toHaveTextContent("Second step");
  });
});

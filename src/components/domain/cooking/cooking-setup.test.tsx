import type { ComponentProps } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  CookingSetup,
  type SetupUnit,
} from "@/components/domain/cooking/cooking-setup";
import { ToastProvider, Toaster } from "@/components/ui/toast";
import { startCookingSession } from "@/lib/cooking/actions";

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
    outputQuantity: 2,
    outputUnit: "cups",
    parentPartLabel: null,
  },
  {
    unitKey: "part-1",
    kind: "PART",
    label: "Sauce",
    estimatedDurationMinutes: null,
    ingredientCount: 3,
    instructionCount: 2,
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
    <ToastProvider>
      <CookingSetup
        dishId="dish-1"
        dishKind="RECIPE"
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
      />
      <Toaster />
    </ToastProvider>,
  );
}

describe("CookingSetup — Version section", () => {
  beforeEach(() => {
    push.mockReset();
    mockSearchParams = new URLSearchParams({ from: "home" });
  });

  it("shows the major-section heading and the canonical searchable picker", async () => {
    renderSetup();

    expect(
      screen.getByRole("heading", { name: "Version", level: 2 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Select a Version" }),
    ).toBeInTheDocument();
  });

  it("switching the Version picker navigates to that Version, preserving other query params", async () => {
    const user = userEvent.setup();
    renderSetup();

    await user.click(
      screen.getByRole("combobox", { name: "Select a Version" }),
    );
    await user.click(await screen.findByRole("option", { name: "V2.0" }));

    expect(push).toHaveBeenCalledWith(
      "/recipes/dish-1/cook?from=home&versionId=v2",
    );
  });
});

describe("CookingSetup — Whole-session scale", () => {
  beforeEach(() => {
    push.mockReset();
    mockSearchParams = new URLSearchParams({ from: "home" });
  });

  it("uses the major-section heading, a description, and prepopulates the target with the Version's default yield", () => {
    renderSetup({ sourceOutputQuantity: 4, sourceOutputUnit: "servings" });

    expect(
      screen.getByRole("heading", { name: "Whole-session scale", level: 2 }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Adjust the entire recipe to cook the amount you need."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Cook for")).toHaveValue("4");
    expect(
      screen.getByText("The recipe will be scaled by 1×."),
    ).toBeInTheDocument();
  });

  it("uses Part-appropriate wording when Cooking Setup is launched for a Part", () => {
    renderSetup({ dishKind: "PART" });

    expect(
      screen.getByText("Adjust the entire part to cook the amount you need."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The part will be scaled by 1×."),
    ).toBeInTheDocument();
  });

  it("derives the multiplier from the user's entered target amount", async () => {
    const user = userEvent.setup();
    renderSetup({ sourceOutputQuantity: 4, sourceOutputUnit: "servings" });

    const input = screen.getByLabelText("Cook for");
    await user.clear(input);
    await user.type(input, "6");

    expect(
      screen.getByText("The recipe will be scaled by 1.5×."),
    ).toBeInTheDocument();
  });
});

describe("CookingSetup — Cooking order and scale", () => {
  beforeEach(() => {
    push.mockReset();
    mockSearchParams = new URLSearchParams({ from: "home" });
  });

  it("uses the major-section heading and a description", () => {
    renderSetup();

    expect(
      screen.getByRole("heading", {
        name: "Cooking order and scale",
        level: 2,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Choose what to include, change the order it appears in Cooking Mode, and scale each section or Part for exactly what you want to cook.",
      ),
    ).toBeInTheDocument();
  });

  it("shows every unit checked (included) by default, with a drag handle per row", () => {
    renderSetup();

    expect(
      screen.getByRole("checkbox", {
        name: "Include Prep in this cooking session",
      }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", {
        name: "Include Sauce in this cooking session",
      }),
    ).toBeChecked();
    expect(
      screen.getByRole("button", { name: "Drag to reorder Prep" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Drag to reorder Sauce" }),
    ).toBeInTheDocument();
  });

  it("places the inclusion checkbox before the drag handle in each row (checkbox left, handle right)", () => {
    renderSetup();

    const row = screen.getByText("Prep").closest("li") as HTMLElement;
    const rowQueries = within(row);
    const checkbox = rowQueries.getByRole("checkbox", {
      name: "Include Prep in this cooking session",
    });
    const handle = rowQueries.getByRole("button", {
      name: "Drag to reorder Prep",
    });
    expect(
      checkbox.compareDocumentPosition(handle) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("unchecking a unit keeps its position — it does not move to the bottom", async () => {
    const user = userEvent.setup();
    renderSetup();

    const list = screen
      .getByRole("checkbox", {
        name: "Include Prep in this cooking session",
      })
      .closest("ul") as HTMLElement;
    const labelsBefore = within(list)
      .getAllByRole("listitem")
      .map((li) => li.textContent);

    await user.click(
      screen.getByRole("checkbox", {
        name: "Include Prep in this cooking session",
      }),
    );

    const labelsAfter = within(list)
      .getAllByRole("listitem")
      .map((li) => li.textContent);

    expect(labelsAfter).toHaveLength(labelsBefore.length);
    // Same relative order, only Prep's checked state changed.
    expect(labelsAfter[0]).toContain("Prep");
    expect(labelsAfter[1]).toContain("Sauce");
    expect(
      screen.getByRole("checkbox", {
        name: "Include Prep in this cooking session",
      }),
    ).not.toBeChecked();
  });

  it("hides the excluded unit's scale control but keeps it for included units", async () => {
    const user = userEvent.setup();
    renderSetup();

    expect(screen.getByLabelText("Make")).toBeInTheDocument();

    await user.click(
      screen.getByRole("checkbox", {
        name: "Include Prep in this cooking session",
      }),
    );

    // Prep (the only unit with an authored yield) is now excluded, so its
    // "Make" target field no longer renders.
    expect(screen.queryByLabelText("Make")).not.toBeInTheDocument();
  });

  it("prepopulates a per-unit target with its authored amount and derives the multiplier, using entity-aware wording", () => {
    renderSetup();

    expect(screen.getByLabelText("Make")).toHaveValue("2");
    expect(
      screen.getByText("This section will be scaled by 1×."),
    ).toBeInTheDocument();
  });

  it("uses 'This part' wording for a reusable Part unit's fallback multiplier field", () => {
    renderSetup();

    expect(
      screen.getByText("This part will be scaled by 1×."),
    ).toBeInTheDocument();
  });
});

describe("CookingSetup — starting a session", () => {
  beforeEach(() => {
    push.mockReset();
    mockSearchParams = new URLSearchParams({ from: "home" });
    vi.mocked(startCookingSession).mockReset();
  });

  it("sends only checked units, in their setup order, to startCookingSession", async () => {
    const user = userEvent.setup();
    vi.mocked(startCookingSession).mockResolvedValue({
      status: "success",
      sessionId: "session-1",
    });
    renderSetup();

    await user.click(
      screen.getByRole("checkbox", {
        name: "Include Sauce in this cooking session",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Start cooking" }));

    // Untouched target fields report an explicit 1× relative factor (the
    // same "no override" meaning `null` used to carry) rather than a blank
    // value — see `TargetScaleField`'s doc comment in scale-control.tsx.
    expect(startCookingSession).toHaveBeenCalledWith(
      expect.objectContaining({
        units: [{ unitKey: "section-1", scaleFactor: 1 }],
      }),
    );
    expect(push).toHaveBeenCalledWith("/cook/session-1");
  });

  it("disables Start cooking once every unit is excluded", async () => {
    const user = userEvent.setup();
    renderSetup();

    await user.click(
      screen.getByRole("checkbox", {
        name: "Include Prep in this cooking session",
      }),
    );
    await user.click(
      screen.getByRole("checkbox", {
        name: "Include Sauce in this cooking session",
      }),
    );

    expect(
      screen.getByRole("button", { name: "Start cooking" }),
    ).toBeDisabled();
  });
});

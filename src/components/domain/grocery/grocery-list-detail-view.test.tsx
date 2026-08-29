import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GroceryListDetailView } from "@/components/domain/grocery/grocery-list-detail-view";
import { ToastProvider, Toaster } from "@/components/ui/toast";
import type {
  GroceryContributionDto,
  GroceryListDetailDto,
  GroceryListItemDto,
} from "@/lib/grocery/list-schema";
import type {
  DishVersionYieldOption,
  GrocerySourceCandidate,
} from "@/lib/grocery/queries";
import type { ResyncMealPlanGroceryListsActionState } from "@/lib/mealplans/actions";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const {
  selectGroceryItemVariant,
  acknowledgeGroceryItemSync,
  updateGroceryListSource,
  listGrocerySourceVersionOptions,
  addGroceryListSource,
} = vi.hoisted(() => ({
  selectGroceryItemVariant: vi.fn(async () => ({ status: "success" })),
  acknowledgeGroceryItemSync: vi.fn(async () => ({ status: "success" })),
  updateGroceryListSource: vi.fn(async () => ({ status: "success" })),
  listGrocerySourceVersionOptions: vi.fn(async () => ({
    status: "success" as const,
    versions: [] as DishVersionYieldOption[],
  })),
  addGroceryListSource: vi.fn(async () => ({ status: "success" })),
}));

vi.mock("@/lib/grocery/list-actions", () => ({
  toggleGroceryItem: vi.fn(async () => ({ status: "success" })),
  addManualGroceryItem: vi.fn(async () => ({ status: "success" })),
  editGroceryItem: vi.fn(async () => ({ status: "success" })),
  removeGroceryItem: vi.fn(async () => ({ status: "success" })),
  recategorizeGroceryItem: vi.fn(async () => ({ status: "success" })),
  reorderGroceryListItems: vi.fn(async () => ({ status: "success" })),
  uncombineGroceryItem: vi.fn(async () => ({ status: "success" })),
  selectGroceryItemVariant,
  updateGroceryListDetails: vi.fn(async () => ({ status: "success" })),
  completeGroceryList: vi.fn(async () => ({ status: "success" })),
  reopenGroceryList: vi.fn(async () => ({ status: "success" })),
  duplicateGroceryList: vi.fn(async () => ({ status: "success" })),
  deleteGroceryList: vi.fn(async () => ({ status: "success" })),
  previewGroceryListSourceRefresh: vi.fn(async () => ({
    status: "success",
    preview: {
      hasNewerMinor: false,
      targetVersionId: "v1",
      targetVersionLabel: "V1.0",
      added: [],
      removed: [],
      changed: [],
    },
  })),
  applyGroceryListSourceRefresh: vi.fn(async () => ({ status: "success" })),
  acknowledgeGroceryItemSync,
  addGroceryListSource,
  removeGroceryListSource: vi.fn(async () => ({ status: "success" })),
  updateGroceryListSource,
  listGrocerySourceVersionOptions,
  generateGroceryList: vi.fn(async () => ({ status: "success", listId: "l" })),
}));

const { resyncMealPlanGroceryLists, setMealPlanGroceryListEntryIncluded } =
  vi.hoisted(() => ({
    resyncMealPlanGroceryLists: vi.fn(
      async (): Promise<ResyncMealPlanGroceryListsActionState> => ({
        status: "success",
        summary: null,
      }),
    ),
    setMealPlanGroceryListEntryIncluded: vi.fn(async () => ({
      status: "success" as const,
    })),
  }));

vi.mock("@/lib/mealplans/actions", () => ({
  resyncMealPlanGroceryLists,
  setMealPlanGroceryListEntryIncluded,
}));

function contribution(
  overrides: Partial<GroceryContributionDto> = {},
): GroceryContributionDto {
  return {
    id: "contribution-1",
    groceryListSourceId: "source-1",
    originalName: "Butter",
    quantityText: "1 cup",
    unit: "cup",
    isOptional: false,
    hasSubstitute: false,
    selectedVariant: "PRIMARY",
    syncState: null,
    previousQuantityText: null,
    sourceTitle: null,
    ...overrides,
  };
}

function item(overrides: Partial<GroceryListItemDto> = {}): GroceryListItemDto {
  return {
    id: "item-1",
    name: "Butter",
    quantityText: "1 cup",
    unit: "cup",
    isOptional: false,
    isManual: false,
    checkedAt: null,
    position: 0,
    category: null,
    contributions: [contribution()],
    syncFlag: "UNCHANGED",
    flagAcknowledgedAt: null,
    ...overrides,
  };
}

function renderList(
  items: GroceryListItemDto[],
  listOverrides: Partial<GroceryListDetailDto> = {},
  sourceCandidates: GrocerySourceCandidate[] = [],
) {
  const list: GroceryListDetailDto = {
    id: "list-1",
    title: "This week",
    createdAt: new Date().toISOString(),
    plannedDate: new Date().toISOString(),
    completedAt: null,
    mode: "STANDALONE",
    linkedMealPlanId: null,
    sources: [],
    items,
    mealPlanEntries: [],
    ...listOverrides,
  };
  return render(
    <ToastProvider>
      <GroceryListDetailView
        list={list}
        categoryOptions={[]}
        sourceCandidates={sourceCandidates}
      />
      <Toaster />
    </ToastProvider>,
  );
}

describe("GroceryListDetailView — reversible substitute selection (Slice 12 correction 2)", () => {
  it("shows 'Use substitute' for an eligible primary-selected contribution and invokes selection with SUBSTITUTE", async () => {
    const user = userEvent.setup();
    renderList([
      item({
        contributions: [
          contribution({ hasSubstitute: true, selectedVariant: "PRIMARY" }),
        ],
      }),
    ]);

    const button = screen.getByRole("button", { name: "Use substitute" });
    expect(
      screen.queryByRole("button", { name: "Use original" }),
    ).not.toBeInTheDocument();

    await user.click(button);
    expect(selectGroceryItemVariant).toHaveBeenCalledWith({
      listId: "list-1",
      itemId: "item-1",
      variant: "SUBSTITUTE",
    });
  });

  it("shows 'Use original' when the substitute is selected and invokes selection with PRIMARY", async () => {
    const user = userEvent.setup();
    renderList([
      item({
        contributions: [
          contribution({ hasSubstitute: true, selectedVariant: "SUBSTITUTE" }),
        ],
      }),
    ]);

    const button = screen.getByRole("button", { name: "Use original" });
    expect(
      screen.queryByRole("button", { name: "Use substitute" }),
    ).not.toBeInTheDocument();

    await user.click(button);
    expect(selectGroceryItemVariant).toHaveBeenCalledWith({
      listId: "list-1",
      itemId: "item-1",
      variant: "PRIMARY",
    });
  });

  it("hides both actions when no substitute snapshot exists", () => {
    renderList([
      item({ contributions: [contribution({ hasSubstitute: false })] }),
    ]);
    expect(
      screen.queryByRole("button", { name: "Use substitute" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Use original" }),
    ).not.toBeInTheDocument();
  });

  it("hides both actions for a manual item even if it somehow carried substitute data", () => {
    renderList([
      item({
        isManual: true,
        contributions: [],
      }),
    ]);
    expect(
      screen.queryByRole("button", { name: "Use substitute" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Use original" }),
    ).not.toBeInTheDocument();
  });

  it("hides both actions for a multi-contribution (combined) item", () => {
    renderList([
      item({
        contributions: [
          contribution({ id: "c1", hasSubstitute: true }),
          contribution({ id: "c2", hasSubstitute: false }),
        ],
      }),
    ]);
    expect(
      screen.queryByRole("button", { name: "Use substitute" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Use original" }),
    ).not.toBeInTheDocument();
  });

  it("hides both actions on a completed list", () => {
    renderList(
      [
        item({
          contributions: [
            contribution({ hasSubstitute: true, selectedVariant: "PRIMARY" }),
          ],
        }),
      ],
      { completedAt: new Date().toISOString() },
    );
    expect(
      screen.queryByRole("button", { name: "Use substitute" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Use original" }),
    ).not.toBeInTheDocument();
  });
});

describe("GroceryListDetailView — mixed optionality display (Slice 12 correction 2)", () => {
  it("labels a manually-merged required+optional item 'Total (with optional)', not 'Optional'", () => {
    renderList([
      item({
        isOptional: false,
        contributions: [
          contribution({ id: "c1", isOptional: false }),
          contribution({ id: "c2", isOptional: true }),
        ],
      }),
    ]);
    expect(screen.getByText("Total (with optional)")).toBeInTheDocument();
    expect(screen.queryByText("Optional")).not.toBeInTheDocument();
  });

  it("keeps the normal Optional badge for a uniformly-optional combined item", () => {
    renderList([
      item({
        contributions: [
          contribution({ id: "c1", isOptional: true }),
          contribution({ id: "c2", isOptional: true }),
        ],
      }),
    ]);
    expect(screen.getByText("Optional")).toBeInTheDocument();
    expect(screen.queryByText("Total (with optional)")).not.toBeInTheDocument();
  });

  it("shows no optionality badge for a uniformly-required combined item", () => {
    renderList([
      item({
        contributions: [
          contribution({ id: "c1", isOptional: false }),
          contribution({ id: "c2", isOptional: false }),
        ],
      }),
    ]);
    expect(screen.queryByText("Optional")).not.toBeInTheDocument();
    expect(screen.queryByText("Total (with optional)")).not.toBeInTheDocument();
  });

  it("preserves each contribution's own optionality in the expanded source breakdown", async () => {
    const user = userEvent.setup();
    renderList([
      item({
        contributions: [
          contribution({
            id: "c1",
            originalName: "Cilantro",
            isOptional: true,
          }),
          contribution({
            id: "c2",
            originalName: "Basil",
            isOptional: false,
          }),
        ],
      }),
    ]);

    await user.click(screen.getByRole("button", { name: /Show sources/ }));
    const cilantroLine = screen.getByText(/Cilantro/).textContent ?? "";
    const basilLine = screen.getByText(/Basil/).textContent ?? "";
    expect(cilantroLine).toContain("optional");
    expect(basilLine).not.toContain("optional");
  });
});

describe("GroceryListDetailView — Meal-Plan sync flags (Slice 15, §81.4)", () => {
  it("flags a materially changed item without hiding it, and acknowledges on click", async () => {
    const user = userEvent.setup();
    renderList([item({ syncFlag: "CHANGED", flagAcknowledgedAt: null })], {
      mode: "MEAL_PLAN_LINKED",
      linkedMealPlanId: "plan-1",
    });

    expect(screen.getByText("Plan changed")).toBeInTheDocument();
    expect(screen.getByText(/Butter/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Acknowledge" }));
    expect(acknowledgeGroceryItemSync).toHaveBeenCalledWith({
      listId: "list-1",
      itemId: "item-1",
    });
  });

  it("flags a checked-off item whose contribution disappeared, preserving its checkmark and name (round-2 Correction 5)", async () => {
    renderList(
      [
        item({
          syncFlag: "REMOVED",
          checkedAt: new Date().toISOString(),
          flagAcknowledgedAt: null,
        }),
      ],
      { mode: "MEAL_PLAN_LINKED", linkedMealPlanId: "plan-1" },
    );

    expect(screen.getByText("No longer in the plan")).toBeInTheDocument();
    const checkbox = screen.getByRole("checkbox", { name: /Butter/ });
    expect(checkbox).toBeChecked();
  });

  it("shows no acknowledge affordance once already acknowledged", () => {
    renderList(
      [
        item({
          syncFlag: "CHANGED",
          flagAcknowledgedAt: new Date().toISOString(),
        }),
      ],
      { mode: "MEAL_PLAN_LINKED", linkedMealPlanId: "plan-1" },
    );
    expect(
      screen.queryByRole("button", { name: "Acknowledge" }),
    ).not.toBeInTheDocument();
  });

  it("shows no sync badges on an ordinary UNCHANGED item", () => {
    renderList([item({ syncFlag: "UNCHANGED" })]);
    expect(screen.queryByText("Plan changed")).not.toBeInTheDocument();
    expect(screen.queryByText("No longer in the plan")).not.toBeInTheDocument();
  });
});

describe("GroceryListDetailView — Edit meal Version/yield recalculation", () => {
  it("preserves the persisted target when switching Version, recalculating the scale from the newly selected Version's own yield", async () => {
    listGrocerySourceVersionOptions.mockReset();
    listGrocerySourceVersionOptions.mockResolvedValue({
      status: "success",
      versions: [
        {
          id: "v1",
          majorVersion: 1,
          minorVersion: 0,
          yieldQuantity: 4,
          yieldUnit: "servings",
        },
        {
          id: "v2",
          majorVersion: 2,
          minorVersion: 0,
          yieldQuantity: 8,
          yieldUnit: "servings",
        },
      ],
    });
    updateGroceryListSource.mockReset();
    updateGroceryListSource.mockResolvedValue({ status: "success" });

    const user = userEvent.setup();
    renderList([], {
      sources: [
        {
          id: "source-1",
          dishId: "dish-1",
          dishVersionId: "v1",
          // Persisted target: 4 (V1.0's own yield) x 1.5 scale = 6.
          scaleFactor: 1.5,
          sourceDishTitleSnapshot: "Weeknight Stir-Fry",
          sourceDishKindSnapshot: "RECIPE",
          sourceDishVersionLabelSnapshot: "V1.0",
          isDeleted: false,
        },
      ],
    });

    await user.click(
      screen.getByRole("button", { name: "Edit Weeknight Stir-Fry" }),
    );

    const servingsInput = await screen.findByLabelText("Servings");
    expect(servingsInput).toHaveValue("6");

    await user.click(
      screen.getByRole("combobox", { name: "Jump to a major version line" }),
    );
    await user.click(await screen.findByRole("option", { name: "V2.0" }));

    // The persisted target (6) is preserved, never reset to the newly
    // selected Version's own raw yield (8) — only the scale recomputes.
    expect(servingsInput).toHaveValue("6");
    expect(screen.getByText(/will be scaled by 0\.75×/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(updateGroceryListSource).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: "source-1",
        targetVersionId: "v2",
        scaleFactor: 0.75,
      }),
    );
  });
});

describe("GroceryListDetailView — Add meal Version selection", () => {
  it("defaults to the candidate's current Version but allows choosing a historical one before adding", async () => {
    listGrocerySourceVersionOptions.mockReset();
    listGrocerySourceVersionOptions.mockResolvedValue({
      status: "success",
      versions: [
        {
          id: "v1",
          majorVersion: 1,
          minorVersion: 0,
          yieldQuantity: 4,
          yieldUnit: "servings",
        },
        {
          id: "v2",
          majorVersion: 2,
          minorVersion: 0,
          yieldQuantity: 8,
          yieldUnit: "servings",
        },
      ],
    });
    addGroceryListSource.mockReset();
    addGroceryListSource.mockResolvedValue({ status: "success" });

    const user = userEvent.setup();
    renderList([], {}, [
      {
        dishId: "dish-1",
        kind: "RECIPE",
        stage: "ACTIVE",
        cuisine: null,
        title: "Weeknight Stir-Fry",
        versionLabel: "V2.0",
        imageAssetId: null,
        tagNames: [],
        rating: { kind: "none" },
        dishVersionId: "v2",
        yieldQuantity: 8,
        yieldUnit: "servings",
      },
    ]);

    await user.click(screen.getByRole("button", { name: "Add meal" }));
    await user.click(
      await screen.findByRole("radio", { name: /Weeknight Stir-Fry/ }),
    );

    // Defaults to the candidate's own current Version (V2.0, makes 8).
    const servingsInput = await screen.findByLabelText("Servings");
    expect(servingsInput).toHaveValue("8");

    // Deliberately choose the historical V1.0 instead — the already-typed
    // servings target (8) is preserved (matching the Edit-meal field's own
    // "never reset on Version switch" behavior), so the scale factor is
    // recomputed against V1.0's own yield (8 / 4 = 2x) instead.
    await user.click(
      screen.getByRole("combobox", { name: "Jump to a major version line" }),
    );
    await user.click(await screen.findByRole("option", { name: "V1.0" }));
    expect(servingsInput).toHaveValue("8");

    const dialog = screen.getByRole("dialog", { name: "Add meal" });
    await user.click(within(dialog).getByRole("button", { name: "Add meal" }));

    expect(addGroceryListSource).toHaveBeenCalledWith(
      expect.objectContaining({
        dishId: "dish-1",
        dishVersionId: "v1",
        scaleFactor: 2,
      }),
    );
  });
});

describe("GroceryListDetailView — Meal-Plan-linked Meals section (§81.7)", () => {
  function linkedList(
    mealPlanEntries: GroceryListDetailDto["mealPlanEntries"],
  ): Partial<GroceryListDetailDto> {
    return {
      mode: "MEAL_PLAN_LINKED",
      linkedMealPlanId: "plan-1",
      sources: [],
      mealPlanEntries,
    };
  }

  it("populates Meals from the linked Meal Plan's own entries, not GroceryListSource rows", () => {
    renderList(
      [],
      linkedList([
        {
          id: "entry-1",
          dishKind: "RECIPE",
          title: "Chili Crisp Bowl",
          versionLabel: "V1.0",
          targetYieldQuantity: 4,
          targetYieldUnit: "servings",
          included: true,
        },
      ]),
    );

    expect(screen.getByText("Chili Crisp Bowl")).toBeInTheDocument();
    expect(
      screen.queryByText("No meals in this list yet."),
    ).not.toBeInTheDocument();
  });

  it("shows Update meal plan navigation instead of Add meal, and never mutates the plan on click", () => {
    renderList([], linkedList([]));

    expect(
      screen.queryByRole("button", { name: "Add meal" }),
    ).not.toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Update meal plan/ });
    expect(link).toHaveAttribute("href", "/meal-plans/plan-1/edit");
  });

  it("toggling an entry's checkbox calls setMealPlanGroceryListEntryIncluded, distinct from the plan's own entry list", async () => {
    setMealPlanGroceryListEntryIncluded.mockClear();
    const user = userEvent.setup();
    renderList([], {
      id: "list-9",
      ...linkedList([
        {
          id: "entry-1",
          dishKind: "RECIPE",
          title: "Chili Crisp Bowl",
          versionLabel: "V1.0",
          targetYieldQuantity: 4,
          targetYieldUnit: "servings",
          included: true,
        },
      ]),
    });

    await user.click(
      screen.getByRole("checkbox", { name: /Chili Crisp Bowl/ }),
    );

    expect(setMealPlanGroceryListEntryIncluded).toHaveBeenCalledWith({
      mealPlanId: "plan-1",
      listId: "list-9",
      entryId: "entry-1",
      included: false,
    });
  });

  it("standalone lists keep Add meal and never show Update meal plan", () => {
    renderList([]);
    expect(
      screen.getByRole("button", { name: "Add meal" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Update meal plan/ }),
    ).not.toBeInTheDocument();
  });
});

describe("GroceryListDetailView — Sync now feedback (§81.2 UX correction)", () => {
  function syncableList(): Partial<GroceryListDetailDto> {
    return {
      mode: "MEAL_PLAN_LINKED",
      linkedMealPlanId: "plan-1",
      sources: [],
      mealPlanEntries: [],
    };
  }

  it("shows a success toast naming what changed when the sync applies changes", async () => {
    resyncMealPlanGroceryLists.mockResolvedValueOnce({
      status: "success",
      summary: { added: 2, removed: 0, changed: 1 },
    });
    const user = userEvent.setup();
    renderList([], syncableList());

    await user.click(screen.getByRole("button", { name: /Sync now/ }));

    expect(await screen.findByText("Grocery list synced")).toBeInTheDocument();
    expect(
      screen.getByText(/2 added, 1 updated from the Meal Plan\./),
    ).toBeInTheDocument();
  });

  it("shows a neutral toast, not a success one, when nothing changed", async () => {
    resyncMealPlanGroceryLists.mockResolvedValueOnce({
      status: "success",
      summary: { added: 0, removed: 0, changed: 0 },
    });
    const user = userEvent.setup();
    renderList([], syncableList());

    await user.click(screen.getByRole("button", { name: /Sync now/ }));

    expect(await screen.findByText("Already up to date")).toBeInTheDocument();
    expect(screen.queryByText("Grocery list synced")).not.toBeInTheDocument();
  });

  it("shows an error toast and leaves the list usable on failure", async () => {
    resyncMealPlanGroceryLists.mockResolvedValueOnce({
      status: "error",
      message: "Could not reach the Meal Plan.",
    });
    const user = userEvent.setup();
    renderList([], syncableList());

    await user.click(screen.getByRole("button", { name: /Sync now/ }));

    expect(
      await screen.findByText("Could not reach the Meal Plan."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sync now/ })).toBeEnabled();
  });
});

describe("GroceryListDetailView — combined-item source breakdown (§61.3)", () => {
  it("identifies which Recipe/Part each contribution in a combined item came from", async () => {
    const user = userEvent.setup();
    renderList([
      item({
        contributions: [
          contribution({
            id: "c1",
            originalName: "Soy sauce",
            quantityText: "4",
            unit: "tbsp",
            sourceTitle: "Chili Crisp Bowl",
          }),
          contribution({
            id: "c2",
            originalName: "Soy sauce",
            quantityText: "2",
            unit: "tbsp",
            sourceTitle: "Vietnamese Nuoc Cham Bowl",
          }),
        ],
      }),
    ]);

    await user.click(screen.getByRole("button", { name: /Show sources/ }));

    expect(screen.getByText(/Chili Crisp Bowl · 4 tbsp/)).toBeInTheDocument();
    expect(
      screen.getByText(/Vietnamese Nuoc Cham Bowl · 2 tbsp/),
    ).toBeInTheDocument();
  });
});

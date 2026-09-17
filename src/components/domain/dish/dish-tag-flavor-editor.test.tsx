import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DishTagFlavorEditor } from "@/components/domain/dish/dish-tag-flavor-editor";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

// setDishTags/setDishFlavorProfiles/setDishCuisines are now offline-capable
// wrappers (`offline-metadata.ts`) routed through
// fetch("/api/sync/dishes", ...) instead of the Server Actions previously
// mocked here — this stub replaces those dead mocks for assertions.
let fetchMock: ReturnType<typeof vi.fn>;

function syncResponse(body: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      status: "applied",
      entityId: "d1",
      serverRevision: null,
      ...body,
    }),
    { status: 200 },
  );
}

function syncPayloads() {
  return fetchMock.mock.calls.map(([, init]) => {
    const body = JSON.parse((init as RequestInit).body as string) as {
      op: string;
      entityId: string;
      payload: unknown;
    };
    return { op: body.op, entityId: body.entityId, payload: body.payload };
  });
}

beforeEach(() => {
  fetchMock = vi.fn(async () => syncResponse());
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderEditor(
  overrides: Partial<React.ComponentProps<typeof DishTagFlavorEditor>> = {},
) {
  return render(
    <DishTagFlavorEditor
      dishId="d1"
      kind="RECIPE"
      tagOptions={[{ id: "tag1", displayName: "Quick", isFavorite: false }]}
      flavorProfileOptions={[{ id: "fp1", displayName: "Spicy" }]}
      cuisineOptions={[{ id: "cuisine1", displayName: "Vietnamese" }]}
      selectedTagIds={[]}
      selectedFlavorProfileValueIds={[]}
      selectedCuisineIds={[]}
      {...overrides}
    />,
  );
}

describe("DishTagFlavorEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves the selected tags, Flavor profiles, and Cuisines", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(
      screen.getByRole("button", { name: "Tags, Flavors & Cuisine" }),
    );
    await user.click(screen.getByText("Quick"));
    await user.click(screen.getByText("Spicy"));
    await user.click(screen.getByText("Vietnamese"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(syncPayloads()).toContainEqual({
        op: "dish.setTags",
        entityId: "d1",
        payload: { dishId: "d1", kind: "RECIPE", tagIds: ["tag1"] },
      });
      expect(syncPayloads()).toContainEqual({
        op: "dish.setFlavorProfiles",
        entityId: "d1",
        payload: {
          dishId: "d1",
          kind: "RECIPE",
          flavorProfileValueIds: ["fp1"],
        },
      });
      expect(syncPayloads()).toContainEqual({
        op: "dish.setCuisines",
        entityId: "d1",
        payload: { dishId: "d1", kind: "RECIPE", cuisineIds: ["cuisine1"] },
      });
    });
  });

  // PRODUCT_SPEC.md §46 (owner decision, 2026-09-02): zero Cuisines is an
  // ordinary valid state (a generic Part where Cuisine isn't meaningful) —
  // saving with none selected still calls setDishCuisines with an empty
  // array, clearing any previously assigned Cuisine, not skipping the call.
  it("saves an empty Cuisine selection when a Dish's Cuisine is cleared", async () => {
    const user = userEvent.setup();
    renderEditor({ selectedCuisineIds: ["cuisine1"] });

    await user.click(
      screen.getByRole("button", { name: "Tags, Flavors & Cuisine" }),
    );
    expect(
      screen.getByRole("checkbox", { name: "Vietnamese" }),
    ).toHaveAttribute("data-state", "checked");
    await user.click(screen.getByText("Vietnamese"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(syncPayloads()).toContainEqual({
        op: "dish.setCuisines",
        entityId: "d1",
        payload: { dishId: "d1", kind: "RECIPE", cuisineIds: [] },
      }),
    );
  });

  it("Cancel discards in-progress selections without saving", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(
      screen.getByRole("button", { name: "Tags, Flavors & Cuisine" }),
    );
    await user.click(screen.getByText("Quick"));
    await user.click(screen.getByText("Vietnamese"));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(syncPayloads()).toHaveLength(0);

    // Reopening starts fresh from the original (unsaved) selection.
    await user.click(
      screen.getByRole("button", { name: "Tags, Flavors & Cuisine" }),
    );
    expect(screen.getByRole("checkbox", { name: "Quick" })).toHaveAttribute(
      "data-state",
      "unchecked",
    );
    expect(
      screen.getByRole("checkbox", { name: "Vietnamese" }),
    ).toHaveAttribute("data-state", "unchecked");
  });
});

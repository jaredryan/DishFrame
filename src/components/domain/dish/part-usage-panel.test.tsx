import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PartUsagePanel } from "@/components/domain/dish/part-usage-panel";
import type { PartUsage } from "@/lib/dishes/queries";

// `propagatePartUpdate` is now `propagatePartUpdateOffline`
// (`offline-propagate.ts`), routed through fetch("/api/sync/dishes", ...)
// instead of the Server Action previously mocked here.
let fetchMock: ReturnType<typeof vi.fn>;

function syncResponse(body: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      status: "applied",
      entityId: "part1",
      serverRevision: null,
      ...body,
    }),
    { status: 200 },
  );
}

function syncPayloads() {
  // A successful mutation also kicks off `runIncrementalPull()` (and, with
  // no sync cursor yet in a fresh test, that falls back to a bootstrap
  // fetch) — both are bare `fetch(url)` calls with no `init`/JSON body, so
  // they're filtered out here rather than mistaken for a mutation payload.
  return fetchMock.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.body != null)
    .map(([, init]) => {
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

function usage(overrides: Partial<PartUsage> = {}): PartUsage {
  return {
    id: "usage-1",
    lineageId: "lineage-1",
    containerDishId: "container-1",
    containerKind: "RECIPE",
    containerTitle: "Weeknight Ragu",
    containerVersionId: "container-v1",
    containerMajorVersion: 1,
    containerMinorVersion: 0,
    targetDishVersionId: "old-version",
    sectionName: null,
    ...overrides,
  };
}

// Nav/details QA batch item 13: "Recipes using this part" (lowercase
// "part") as a major section heading, no outer wrapper card.
describe("PartUsagePanel", () => {
  it("shows the lowercase 'Recipes using this part' heading even when empty", () => {
    render(
      <PartUsagePanel usages={[]} currentVersionId="v2" partDishId="part1" />,
    );
    expect(
      screen.getByRole("heading", { name: "Recipes using this part" }),
    ).toBeInTheDocument();
  });

  it("shows the heading alongside each usage row when populated", () => {
    render(
      <PartUsagePanel
        usages={[usage()]}
        currentVersionId="v2"
        partDishId="part1"
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Recipes using this part" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Weeknight Ragu")).toBeInTheDocument();
  });

  it("propagates the current Version to every out-of-date usage via Update everywhere", async () => {
    const user = userEvent.setup();
    render(
      <PartUsagePanel
        usages={[usage({ targetDishVersionId: "old-version" })]}
        currentVersionId="new-version"
        partDishId="part1"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Update everywhere" }));

    await waitFor(() =>
      expect(syncPayloads()).toContainEqual({
        op: "dish.propagatePartUpdate",
        entityId: "part1",
        payload: expect.objectContaining({
          partDishId: "part1",
          newTargetVersionId: "new-version",
          selections: [
            expect.objectContaining({
              containerDishId: "container-1",
              lineageId: "lineage-1",
            }),
          ],
        }),
      }),
    );
  });
});

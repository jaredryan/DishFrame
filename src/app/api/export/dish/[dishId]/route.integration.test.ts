import { describe, it, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { createTestUser, deleteTestUser } from "@/test/factories";
import * as dishService from "@/lib/dishes/service";
import type { DishContentInput } from "@/lib/dishes/schema";

/**
 * Slice 11 correction pass: exercises the real Route Handler (private
 * download headers, safe filenames, Version-mode query validation) against
 * real Postgres rows — mirrors `api/images/[assetId]/route.integration.test.ts`,
 * mocking only the authenticated session.
 */
const mockGetServerSession = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  getServerSession: () => mockGetServerSession(),
}));

function content(overrides: Partial<DishContentInput> = {}): DishContentInput {
  return {
    title: "Ginger Soy Bowl",
    stage: "IDEA",
    cuisine: null,
    description: null,
    yieldQuantity: null,
    yieldUnit: null,
    prepTimeMinutes: null,
    cookTimeMinutes: null,
    difficulty: null,
    imageAssetId: null,
    sections: [
      {
        name: null,
        guidanceNote: null,
        position: 0,
        ingredients: [
          {
            name: "Salt",
            quantity: null,
            quantityEnd: null,
            isApproximate: false,
            unit: null,
            displayText: null,
            preparationNote: null,
            isOptional: false,
            substitute: null,
          },
        ],
        instructions: [],
        partLinks: [],
      },
    ],
    partLinks: [],
    ...overrides,
  };
}

function requestFor(dishId: string, search = "") {
  return {
    request: new Request(`http://x/api/export/dish/${dishId}${search}`),
    context: { params: Promise.resolve({ dishId }) },
  };
}

describe("GET /api/export/dish/[dishId]", () => {
  let userIds: string[] = [];

  afterEach(async () => {
    for (const id of userIds) {
      await deleteTestUser(id);
    }
    userIds = [];
    mockGetServerSession.mockReset();
  });

  it("rejects a request with no signed-in session", async () => {
    const { GET } = await import("./route");
    mockGetServerSession.mockResolvedValue(null);
    const { request, context } = requestFor("does-not-matter");
    const response = await GET(request, context);
    expect(response.status).toBe(401);
  });

  it("returns private, non-cacheable JSON download headers with a sanitized filename", async () => {
    const owner = await createTestUser();
    userIds.push(owner.id);
    const dishId = await dishService.createDish(
      owner.id,
      "RECIPE",
      content({ title: 'Weeknight "Tacos"\r\nX-Injected: 1' }),
    );
    mockGetServerSession.mockResolvedValue({ user: { id: owner.id } });

    const { GET } = await import("./route");
    const { request, context } = requestFor(dishId);
    const response = await GET(request, context);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const disposition = response.headers.get("Content-Disposition")!;
    const match = disposition.match(/^attachment; filename="(.*)"$/);
    expect(match).not.toBeNull();
    const filenameValue = match![1];
    expect(filenameValue).not.toMatch(/[\r\n"\\]/);
    // The injection attempt survives only as harmless literal filename text
    // (CRLF/quotes stripped) — it must never become a second real header.
    expect(response.headers.get("X-Injected")).toBeNull();
  });

  it("defaults to the current Version and includes stable envelope metadata", async () => {
    const owner = await createTestUser();
    userIds.push(owner.id);
    const dishId = await dishService.createDish(owner.id, "RECIPE", content());
    const dish = await prisma.dish.findUniqueOrThrow({ where: { id: dishId } });
    mockGetServerSession.mockResolvedValue({ user: { id: owner.id } });

    const { GET } = await import("./route");
    const { request, context } = requestFor(dishId);
    const response = await GET(request, context);
    const dto = await response.json();

    expect(dto.format).toBe("dishframe.dish-export");
    expect(dto.formatVersion).toBe(1);
    expect(dto.exportedAt).toBeTruthy();
    expect(dto.scope.versionMode).toBe("SINGLE");
    expect(dto.scope.versionId).toBe(dish.currentVersionId);
  });

  it("honors an explicit versionMode=ALL query param", async () => {
    const owner = await createTestUser();
    userIds.push(owner.id);
    const dishId = await dishService.createDish(owner.id, "RECIPE", content());
    mockGetServerSession.mockResolvedValue({ user: { id: owner.id } });

    const { GET } = await import("./route");
    const { request, context } = requestFor(dishId, "?versionMode=ALL");
    const response = await GET(request, context);
    const dto = await response.json();

    expect(dto.scope.versionMode).toBe("ALL");
    expect(dto.scope).not.toHaveProperty("versionId");
  });

  it("rejects an invalid versionMode query param", async () => {
    const owner = await createTestUser();
    userIds.push(owner.id);
    const dishId = await dishService.createDish(owner.id, "RECIPE", content());
    mockGetServerSession.mockResolvedValue({ user: { id: owner.id } });

    const { GET } = await import("./route");
    const { request, context } = requestFor(dishId, "?versionMode=BOGUS");
    const response = await GET(request, context);
    expect(response.status).toBe(400);
  });

  it("never exports another owner's Dish", async () => {
    const owner = await createTestUser();
    const intruder = await createTestUser();
    userIds.push(owner.id, intruder.id);
    const dishId = await dishService.createDish(owner.id, "RECIPE", content());
    mockGetServerSession.mockResolvedValue({ user: { id: intruder.id } });

    const { GET } = await import("./route");
    const { request, context } = requestFor(dishId);
    const response = await GET(request, context);
    expect(response.status).toBe(404);
  });
});

import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { createTestUser, deleteTestUser } from "@/test/factories";
import { initializeNewUser } from "@/lib/account/init";
import * as tasterService from "@/lib/tasters/service";
import { NotFoundError, ConflictError } from "@/lib/errors";

describe("taster service", () => {
  let userId: string | undefined;

  afterEach(async () => {
    if (userId) {
      await deleteTestUser(userId);
      userId = undefined;
    }
  });

  it("cannot archive the built-in owner Taster", async () => {
    const user = await createTestUser();
    userId = user.id;
    await initializeNewUser(userId);

    const owner = await prisma.taster.findFirstOrThrow({
      where: { ownerId: userId, isOwner: true },
    });

    await expect(tasterService.archiveTaster(userId, owner.id)).rejects.toThrow(
      ConflictError,
    );

    const stillActive = await prisma.taster.findUniqueOrThrow({
      where: { id: owner.id },
    });
    expect(stillActive.archivedAt).toBeNull();
  });

  it("cannot delete the built-in owner Taster", async () => {
    const user = await createTestUser();
    userId = user.id;
    await initializeNewUser(userId);

    const owner = await prisma.taster.findFirstOrThrow({
      where: { ownerId: userId, isOwner: true },
    });

    await expect(tasterService.deleteTaster(userId, owner.id)).rejects.toThrow(
      ConflictError,
    );

    expect(
      await prisma.taster.findUnique({ where: { id: owner.id } }),
    ).not.toBeNull();
  });

  it("can rename the built-in owner Taster", async () => {
    const user = await createTestUser();
    userId = user.id;
    await initializeNewUser(userId);

    const owner = await prisma.taster.findFirstOrThrow({
      where: { ownerId: userId, isOwner: true },
    });

    const renamed = await tasterService.renameTaster(userId, owner.id, "Jared");
    expect(renamed.name).toBe("Jared");
  });

  it("can archive, restore, and delete an ordinary Taster", async () => {
    const user = await createTestUser();
    userId = user.id;
    await initializeNewUser(userId);

    const mom = await tasterService.createTaster(userId, "Mom");
    await tasterService.archiveTaster(userId, mom.id);
    expect(
      (await prisma.taster.findUniqueOrThrow({ where: { id: mom.id } }))
        .archivedAt,
    ).not.toBeNull();

    await tasterService.restoreTaster(userId, mom.id);
    expect(
      (await prisma.taster.findUniqueOrThrow({ where: { id: mom.id } }))
        .archivedAt,
    ).toBeNull();

    await tasterService.deleteTaster(userId, mom.id);
    expect(
      await prisma.taster.findUnique({ where: { id: mom.id } }),
    ).toBeNull();
  });

  it("rejects a direct database insert of a second owner Taster (partial unique index)", async () => {
    const user = await createTestUser();
    userId = user.id;
    await initializeNewUser(userId);

    await expect(
      prisma.taster.create({
        data: {
          ownerId: userId,
          name: "Duplicate You",
          position: 1,
          isOwner: true,
        },
      }),
    ).rejects.toThrow();
  });

  it("scopes Tasters to their owner — another user cannot see or mutate them", async () => {
    const owner = await createTestUser();
    const intruder = await createTestUser();
    userId = owner.id;

    const taster = await tasterService.createTaster(owner.id, "Dad");

    await expect(
      tasterService.renameTaster(intruder.id, taster.id, "Hacked"),
    ).rejects.toThrow(NotFoundError);

    await deleteTestUser(intruder.id);
  });

  it("assigns new Tasters an increasing position, in creation order", async () => {
    const user = await createTestUser();
    userId = user.id;
    await initializeNewUser(userId);

    const mom = await tasterService.createTaster(userId, "Mom");
    const dad = await tasterService.createTaster(userId, "Dad");

    const owner = await prisma.taster.findFirstOrThrow({
      where: { ownerId: userId, isOwner: true },
    });
    expect(owner.position).toBe(0);
    expect(mom.position).toBe(1);
    expect(dad.position).toBe(2);
  });

  it("reorders Tasters and persists the new positions (drag-and-drop, same pattern as Grocery Categories)", async () => {
    const user = await createTestUser();
    userId = user.id;
    await initializeNewUser(userId);
    await tasterService.createTaster(userId, "Mom");
    await tasterService.createTaster(userId, "Dad");

    const tasters = await prisma.taster.findMany({
      where: { ownerId: userId },
      orderBy: { position: "asc" },
    });
    const reversedIds = [...tasters].reverse().map((t) => t.id);

    await tasterService.reorderTasters(userId, reversedIds);

    const reloaded = await prisma.taster.findMany({
      where: { ownerId: userId },
      orderBy: { position: "asc" },
    });
    expect(reloaded.map((t) => t.id)).toEqual(reversedIds);
    // The built-in owner Taster is freely reorderable — only its
    // archive/delete actions are protected, not its position.
    expect(reloaded[reloaded.length - 1].isOwner).toBe(true);
  });

  it("rejects reordering with an id that isn't owned by the caller", async () => {
    const owner = await createTestUser();
    const intruder = await createTestUser();
    userId = owner.id;
    await initializeNewUser(owner.id);

    const ownerTaster = await prisma.taster.findFirstOrThrow({
      where: { ownerId: owner.id, isOwner: true },
    });
    const intruderTaster = await tasterService.createTaster(
      intruder.id,
      "Not yours",
    );

    await expect(
      tasterService.reorderTasters(owner.id, [
        intruderTaster.id,
        ownerTaster.id,
      ]),
    ).rejects.toThrow(ConflictError);

    await deleteTestUser(intruder.id);
  });

  // Slice 3 closeout audit: a reorder submitting fewer than the caller's
  // complete owned set must be rejected outright, not partially applied —
  // otherwise the omitted row keeps its old position, which can collide
  // with a newly assigned one and corrupt ordering.
  it("rejects a reorder that omits a currently owned Taster", async () => {
    const user = await createTestUser();
    userId = user.id;
    await initializeNewUser(userId);
    const mom = await tasterService.createTaster(userId, "Mom");
    await tasterService.createTaster(userId, "Dad");

    const before = await prisma.taster.findMany({
      where: { ownerId: userId },
      orderBy: { position: "asc" },
    });

    // Omits "Dad" entirely.
    const owner = before.find((t) => t.isOwner)!;
    await expect(
      tasterService.reorderTasters(userId, [mom.id, owner.id]),
    ).rejects.toThrow(ConflictError);

    // Nothing was silently partially applied — positions are unchanged.
    const after = await prisma.taster.findMany({
      where: { ownerId: userId },
      orderBy: { position: "asc" },
    });
    expect(after.map((t) => ({ id: t.id, position: t.position }))).toEqual(
      before.map((t) => ({ id: t.id, position: t.position })),
    );
  });

  it("rejects a reorder with a duplicated id", async () => {
    const user = await createTestUser();
    userId = user.id;
    await initializeNewUser(userId);
    const mom = await tasterService.createTaster(userId, "Mom");

    const owner = await prisma.taster.findFirstOrThrow({
      where: { ownerId: userId, isOwner: true },
    });

    await expect(
      tasterService.reorderTasters(userId, [mom.id, mom.id]),
    ).rejects.toThrow(ConflictError);
    // Confirms the rejection is specifically about the duplicate/omission
    // shape, not a coincidental count match: submitting the real complete
    // set (mom + owner) succeeds.
    await expect(
      tasterService.reorderTasters(userId, [mom.id, owner.id]),
    ).resolves.not.toThrow();
  });
});

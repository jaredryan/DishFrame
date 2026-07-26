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
        data: { ownerId: userId, name: "Duplicate You", isOwner: true },
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
});

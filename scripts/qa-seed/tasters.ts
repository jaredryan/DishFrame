import { prisma } from "@/lib/db/prisma";
import type { createTaster as CreateTaster } from "@/lib/tasters/service";

export type TasterServices = { createTaster: typeof CreateTaster };

export type TasterFixtureIds = {
  you: string;
  partner: string;
  kid: string;
  formerRoommate: string;
};

/**
 * The account's own "You" Taster is a protected singleton created by
 * `initializeNewUser` (owner.ts's `resolveSeedOwner`) — fetched here, not
 * recreated. Three additional Tasters cover rated/archived diversity:
 * Partner and Kid stay active (`reviews.ts` rates each a different subset
 * of sessions, leaving some sessions with genuinely fewer raters than
 * others); Former Roommate is archived by `reviews.ts` after rating one
 * session, leaving exactly the "archived Taster still visible on that
 * session's own history" fixture PRODUCT_SPEC.md §34.5 describes.
 */
export async function buildTasterFixtures(
  { createTaster }: TasterServices,
  ownerId: string,
): Promise<TasterFixtureIds> {
  const you = await prisma.taster.findFirstOrThrow({
    where: { ownerId, isOwner: true },
    select: { id: true },
  });
  const partner = await createTaster(ownerId, "[QA] Partner");
  const kid = await createTaster(ownerId, "[QA] Kid");
  const formerRoommate = await createTaster(ownerId, "[QA] Former Roommate");

  return {
    you: you.id,
    partner: partner.id,
    kid: kid.id,
    formerRoommate: formerRoommate.id,
  };
}

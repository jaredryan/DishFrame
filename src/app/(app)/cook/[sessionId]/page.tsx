import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import {
  getOwnedSessionOrThrow,
  getSessionSourceSummary,
  getOwnedDishVersionOrThrow,
  buildCookableUnits,
} from "@/lib/cooking/queries";
import { NotFoundError } from "@/lib/errors";
import {
  CookingSessionShell,
  type SessionUnit,
} from "@/components/domain/cooking/cooking-session-shell";

export const metadata: Metadata = { title: "Cooking session" };

export default async function CookingSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const session = await getServerSession();
  if (!session) redirect("/sign-in");

  const { sessionId } = await params;

  let cookingSession;
  try {
    cookingSession = await getOwnedSessionOrThrow(session.user.id, sessionId);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const sourceSummary = await getSessionSourceSummary(
    cookingSession.dishId,
    cookingSession.dishVersionId,
  );

  const toSessionUnit = (
    unit: (typeof cookingSession.units)[number],
  ): SessionUnit => ({
    id: unit.id,
    label: unit.label,
    sourceDishTitle: unit.sourceDishTitle,
    sourceDishVersionLabel: unit.sourceDishVersionLabel,
    removedAt: unit.removedAt ? unit.removedAt.toISOString() : null,
    removedAfterProgress: unit.removedAfterProgress,
    checklistItems: unit.checklistItems.map((item) => ({
      id: item.id,
      kind: item.kind,
      displayText: item.displayText,
      displayQuantity: item.displayQuantity,
      displayUnit: item.displayUnit,
    })),
  });

  const activeUnits = cookingSession.units
    .filter((u) => !u.removedAt)
    .map(toSessionUnit);
  const removedUnits = cookingSession.units
    .filter((u) => u.removedAt)
    .map(toSessionUnit);

  let addableUnits: Array<{ unitKey: string; label: string }> = [];
  if (cookingSession.state === "IN_PROGRESS") {
    const { dish, version } = await getOwnedDishVersionOrThrow(
      session.user.id,
      cookingSession.dishId,
      cookingSession.dishVersionId,
    );
    const cookableUnits = await buildCookableUnits(
      session.user.id,
      dish,
      version,
    );
    const existingKeys = new Set(
      cookingSession.units.map((u) =>
        u.sourceSectionLineageId
          ? `section:${u.sourceSectionLineageId}`
          : `part:${u.sourcePartLinkLineageId}`,
      ),
    );
    addableUnits = cookableUnits
      .filter((unit) => !existingKeys.has(unit.unitKey))
      .map((unit) => ({ unitKey: unit.unitKey, label: unit.label }));
  }

  return (
    <CookingSessionShell
      sessionId={cookingSession.id}
      state={cookingSession.state}
      startedAt={cookingSession.startedAt.toISOString()}
      endedAt={
        cookingSession.endedAt ? cookingSession.endedAt.toISOString() : null
      }
      rawElapsedSeconds={cookingSession.rawElapsedSeconds}
      dishId={cookingSession.dishId}
      dishTitle={sourceSummary.dishTitle}
      dishKind={sourceSummary.dishKind}
      versionLabel={sourceSummary.versionLabel}
      activeUnits={activeUnits}
      removedUnits={removedUnits}
      addableUnits={addableUnits}
    />
  );
}

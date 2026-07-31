import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import {
  getOwnedDishVersionOrThrow,
  buildCookableUnits,
} from "@/lib/cooking/queries";
import { getOwnedDishOrThrow } from "@/lib/dishes/queries";
import { NotFoundError } from "@/lib/errors";
import {
  CookingSetup,
  type SetupUnit,
} from "@/components/domain/cooking/cooking-setup";
import { versionLabel } from "@/lib/dishes/version-note";
import { decimalToNumber } from "@/lib/dishes/format";

export const metadata: Metadata = { title: "Cooking setup" };

export default async function PartCookingSetupPage({
  params,
  searchParams,
}: {
  params: Promise<{ dishId: string }>;
  searchParams: Promise<{ versionId?: string }>;
}) {
  const session = await getServerSession();
  if (!session) redirect("/sign-in");

  const { dishId } = await params;
  const { versionId } = await searchParams;

  let dish, version;
  try {
    const dishRow = await getOwnedDishOrThrow(session.user.id, dishId, "PART");
    const targetVersionId = versionId || dishRow.currentVersionId;
    if (!targetVersionId) throw new NotFoundError("Part not found.");
    const result = await getOwnedDishVersionOrThrow(
      session.user.id,
      dishId,
      targetVersionId,
    );
    dish = result.dish;
    version = result.version;
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const cookableUnits = await buildCookableUnits(
    session.user.id,
    dish,
    version,
  );
  const units: SetupUnit[] = cookableUnits.map((unit) => ({
    unitKey: unit.unitKey,
    kind: unit.kind,
    label: unit.label,
    estimatedDurationMinutes: unit.estimatedDurationMinutes,
    ingredientCount: unit.checklist.filter((i) => i.kind === "INGREDIENT")
      .length,
    instructionCount: unit.checklist.filter((i) => i.kind === "INSTRUCTION")
      .length,
    outputQuantity: unit.outputQuantity,
    outputUnit: unit.outputUnit,
  }));

  return (
    <CookingSetup
      kind="PART"
      dishId={dish.id}
      dishVersionId={version.id}
      dishTitle={dish.currentTitle || "Untitled"}
      versionLabel={versionLabel(version.majorVersion, version.minorVersion)}
      isCurrent={version.id === dish.currentVersionId}
      units={units}
      sourceOutputQuantity={decimalToNumber(version.yieldQuantity)}
      sourceOutputUnit={version.yieldUnit}
    />
  );
}

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { buildCookableUnits } from "@/lib/cooking/queries";
import {
  getOwnedDishOrThrow,
  getDishScopedVersionContentOrThrow,
  listDishVersionSummaries,
} from "@/lib/dishes/queries";
import { NotFoundError } from "@/lib/errors";
import {
  CookingSetup,
  type SetupUnit,
} from "@/components/domain/cooking/cooking-setup";
import { versionLabel } from "@/lib/dishes/version-note";
import { decimalToNumber } from "@/lib/dishes/format";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ dishId: string }>;
}): Promise<Metadata> {
  const session = await getServerSession();
  if (!session) return {};
  const { dishId } = await params;
  try {
    const dish = await getOwnedDishOrThrow(session.user.id, dishId, "PART");
    return { title: `${dish.currentTitle ?? "Part"} — Cooking setup` };
  } catch {
    return {};
  }
}

export default async function PartCookingSetupPage({
  params,
  searchParams,
}: {
  params: Promise<{ dishId: string }>;
  searchParams: Promise<{ versionId?: string; from?: string }>;
}) {
  const session = await getServerSession();
  if (!session) redirect("/sign-in");

  const { dishId } = await params;
  const { versionId, from } = await searchParams;
  const cancelHref =
    from === "home" ? "/home" : from === "cook" ? "/cook" : `/parts/${dishId}`;

  let dish, version;
  try {
    dish = await getOwnedDishOrThrow(session.user.id, dishId, "PART");
    const targetVersionId = versionId || dish.currentVersionId;
    if (!targetVersionId) throw new NotFoundError("Part not found.");
    // Ownership of `dishId` is already established above — scope directly
    // by dishId instead of re-fetching the Dish row a second time.
    version = await getDishScopedVersionContentOrThrow(dishId, targetVersionId);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const [cookableUnits, versions] = await Promise.all([
    buildCookableUnits(session.user.id, dish, version),
    listDishVersionSummaries(dishId),
  ]);
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
    parentPartLabel: unit.partViaTitleSnapshot,
  }));

  return (
    <CookingSetup
      // Remounts (and so resets local plan/scale state) whenever the
      // selected Version changes — the units/yield below are already
      // re-derived server-side for the new Version.
      key={version.id}
      dishId={dish.id}
      dishKind="PART"
      dishVersionId={version.id}
      dishTitle={dish.currentTitle || "Untitled"}
      versionLabel={versionLabel(version.majorVersion, version.minorVersion)}
      isCurrent={version.id === dish.currentVersionId}
      currentVersionId={dish.currentVersionId}
      versions={versions}
      units={units}
      sourceOutputQuantity={decimalToNumber(version.yieldQuantity)}
      sourceOutputUnit={version.yieldUnit}
      cancelHref={cancelHref}
    />
  );
}

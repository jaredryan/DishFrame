import { getServerSession } from "@/lib/auth/session";
import { NotFoundError, ValidationError } from "@/lib/errors";
import {
  buildDishExportDto,
  exportTierValues,
  versionModeValues,
  sanitizeExportFilename,
  type DishVersionSelection,
  type ExportTierValue,
  type VersionModeValue,
} from "@/lib/importExport/export-dto";
import { dishKindValues, type DishKindValue } from "@/lib/dishes/schema";

/**
 * PRODUCT_SPEC.md §55.2-§55.6: one Recipe or Part, at the requested privacy
 * tier and Version selection. Owner authorization applies to every private
 * read — `buildDishExportDto` scopes its lookup by `ownerId` AND `dishId`
 * together (never `dishId` alone then checked after), so a `dishId`
 * belonging to another account resolves to the same "not found" a
 * genuinely missing id would, exactly like every other
 * `getOwnedDishOrThrow`-style guard in this codebase.
 *
 * Slice 11 correction pass: `versionMode`/`versionId` query params select
 * one coherent Version scope — `SINGLE` (default, resolves to the current
 * Version when `versionId` is omitted) or `ALL` — never both at once.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ dishId: string }> },
) {
  const session = await getServerSession();
  if (!session) {
    return Response.json({ message: "Sign in required." }, { status: 401 });
  }

  const { dishId } = await params;
  const url = new URL(request.url);
  const kindParam = url.searchParams.get("kind") ?? "RECIPE";
  const tierParam = url.searchParams.get("tier") ?? "STANDARD";
  const versionModeParam = url.searchParams.get("versionMode") ?? "SINGLE";
  const versionIdParam = url.searchParams.get("versionId") ?? undefined;

  if (!dishKindValues.includes(kindParam as DishKindValue)) {
    return Response.json({ message: "Invalid kind." }, { status: 400 });
  }
  if (!exportTierValues.includes(tierParam as ExportTierValue)) {
    return Response.json({ message: "Invalid export tier." }, { status: 400 });
  }
  if (!versionModeValues.includes(versionModeParam as VersionModeValue)) {
    return Response.json({ message: "Invalid version mode." }, { status: 400 });
  }

  const versionSelection: DishVersionSelection =
    versionModeParam === "ALL"
      ? { mode: "ALL" }
      : { mode: "SINGLE", versionId: versionIdParam };

  try {
    const dto = await buildDishExportDto(
      session.user.id,
      dishId,
      kindParam as DishKindValue,
      tierParam as ExportTierValue,
      versionSelection,
    );
    const body = JSON.stringify(dto, null, 2);
    const filename = sanitizeExportFilename(dto.title);

    return new Response(body, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return Response.json({ message: error.message }, { status: 404 });
    }
    if (error instanceof ValidationError) {
      return Response.json({ message: error.message }, { status: 400 });
    }
    throw error;
  }
}

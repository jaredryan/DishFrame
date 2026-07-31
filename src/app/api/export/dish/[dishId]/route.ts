import { getServerSession } from "@/lib/auth/session";
import { NotFoundError, ValidationError } from "@/lib/errors";
import {
  buildDishExportDto,
  exportTierValues,
  type ExportTierValue,
} from "@/lib/importExport/export-dto";
import { dishKindValues, type DishKindValue } from "@/lib/dishes/schema";

/**
 * PRODUCT_SPEC.md §55.2-§55.6: one Recipe or Part, at the requested privacy
 * tier. Owner authorization applies to every private read — `buildDishExportDto`
 * scopes its lookup by `ownerId` AND `dishId` together (never `dishId` alone
 * then checked after), so a `dishId` belonging to another account resolves
 * to the same "not found" a genuinely missing id would, exactly like every
 * other `getOwnedDishOrThrow`-style guard in this codebase.
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

  if (!dishKindValues.includes(kindParam as DishKindValue)) {
    return Response.json({ message: "Invalid kind." }, { status: 400 });
  }
  if (!exportTierValues.includes(tierParam as ExportTierValue)) {
    return Response.json({ message: "Invalid export tier." }, { status: 400 });
  }

  try {
    const dto = await buildDishExportDto(
      session.user.id,
      dishId,
      kindParam as DishKindValue,
      tierParam as ExportTierValue,
    );
    const body = JSON.stringify(dto, null, 2);
    const filename = `${dto.title || "export"}.json`.replace(
      /[^a-z0-9.\- ]/gi,
      "_",
    );

    return new Response(body, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
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

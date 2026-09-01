import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { getOwnedVersionDetailOrThrow } from "@/lib/dishes/queries";
import { VersionHistoryView } from "@/components/domain/dish/version-history-view";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ dishId: string; versionId: string }>;
}): Promise<Metadata> {
  const session = await getServerSession();
  if (!session) return {};
  const { dishId, versionId } = await params;
  try {
    const { dish, version } = await getOwnedVersionDetailOrThrow(
      session.user.id,
      dishId,
      versionId,
      "RECIPE",
    );
    const title = dish.currentTitle || version.title;
    return {
      title: `${title} — V${version.majorVersion}.${version.minorVersion}`,
    };
  } catch {
    return {};
  }
}

export default async function RecipeVersionPage({
  params,
}: {
  params: Promise<{ dishId: string; versionId: string }>;
}) {
  const session = await getServerSession();
  if (!session) {
    redirect("/sign-in");
  }
  const { dishId, versionId } = await params;

  return (
    <VersionHistoryView
      ownerId={session.user.id}
      dishId={dishId}
      versionId={versionId}
      kind="RECIPE"
    />
  );
}

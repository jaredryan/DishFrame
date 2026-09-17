import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { getOwnedVersionDetailOrThrow } from "@/lib/dishes/queries";
import { buildVersionHistoryViewProps } from "@/lib/dishes/version-history-page-props";
import { VersionHistoryOfflineBoundary } from "@/components/domain/dish/version-history-offline-boundary";
import { OFFLINE_SHELL_SENTINEL } from "@/lib/offline/shell-sentinel";

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
  const { dishId, versionId } = await params;

  if (
    dishId === OFFLINE_SHELL_SENTINEL ||
    versionId === OFFLINE_SHELL_SENTINEL
  ) {
    return <VersionHistoryOfflineBoundary serverProps={null} />;
  }

  const session = await getServerSession();
  if (!session) {
    redirect("/sign-in");
  }

  const props = await buildVersionHistoryViewProps(
    session.user.id,
    dishId,
    versionId,
    "RECIPE",
  );

  return <VersionHistoryOfflineBoundary serverProps={props} />;
}

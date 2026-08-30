import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { listDistinctCuisines } from "@/lib/dishes/queries";
import { listTags } from "@/lib/tags/queries";
import { listFlavorProfileValues } from "@/lib/flavor-profiles/queries";
import { PasteImportFlow } from "@/components/domain/dish/paste-import-flow";

export const metadata: Metadata = {
  title: "Import a Part",
};

export default async function ImportPartPage() {
  const session = await getServerSession();
  if (!session) {
    redirect("/sign-in");
  }

  const [cuisineOptions, tags, flavorProfiles] = await Promise.all([
    listDistinctCuisines(session.user.id, "PART"),
    listTags(session.user.id),
    listFlavorProfileValues(session.user.id),
  ]);

  return (
    <PasteImportFlow
      kind="PART"
      cuisineOptions={cuisineOptions}
      tagOptions={tags.map((tag) => ({
        id: tag.id,
        displayName: tag.displayName,
      }))}
      flavorProfileOptions={flavorProfiles.map((value) => ({
        id: value.id,
        displayName: value.displayName,
      }))}
    />
  );
}

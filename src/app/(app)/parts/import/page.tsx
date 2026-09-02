import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { listTags } from "@/lib/tags/queries";
import { listFlavorProfileValues } from "@/lib/flavor-profiles/queries";
import { listCuisines } from "@/lib/cuisines/queries";
import { PasteImportFlow } from "@/components/domain/dish/paste-import-flow";

export const metadata: Metadata = {
  title: "Import a Part",
};

export default async function ImportPartPage() {
  const session = await getServerSession();
  if (!session) {
    redirect("/sign-in");
  }

  const [cuisines, tags, flavorProfiles] = await Promise.all([
    listCuisines(session.user.id),
    listTags(session.user.id),
    listFlavorProfileValues(session.user.id),
  ]);

  return (
    <PasteImportFlow
      kind="PART"
      cuisineOptions={cuisines.map((cuisine) => ({
        id: cuisine.id,
        displayName: cuisine.displayName,
      }))}
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

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { listDistinctCuisines } from "@/lib/dishes/queries";
import { PasteImportFlow } from "@/components/domain/dish/paste-import-flow";

export const metadata: Metadata = {
  title: "Import a Part",
};

export default async function ImportPartPage() {
  const session = await getServerSession();
  if (!session) {
    redirect("/sign-in");
  }

  const cuisineOptions = await listDistinctCuisines(session.user.id, "PART");

  return <PasteImportFlow kind="PART" cuisineOptions={cuisineOptions} />;
}

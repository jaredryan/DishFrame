import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { resolveOwnerPrintContent } from "@/lib/print/service";
import { NotFoundError } from "@/lib/errors";
import { PrintToolbar } from "@/components/domain/print/print-toolbar";
import { PrintDocument } from "@/components/domain/print/print-document";

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ dishId: string }>;
  searchParams: Promise<{ versionId?: string }>;
}): Promise<Metadata> {
  const session = await getServerSession();
  if (!session) return {};
  const { dishId } = await params;
  const { versionId } = await searchParams;
  try {
    const { content } = await resolveOwnerPrintContent(
      session.user.id,
      dishId,
      "RECIPE",
      versionId,
    );
    return { title: `${content.title} — Recipe ${content.versionLabel}` };
  } catch {
    return {};
  }
}

export default async function RecipePrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ dishId: string }>;
  searchParams: Promise<{ versionId?: string }>;
}) {
  const session = await getServerSession();
  if (!session) {
    redirect("/sign-in");
  }

  const { dishId } = await params;
  const { versionId } = await searchParams;

  let result;
  try {
    result = await resolveOwnerPrintContent(
      session.user.id,
      dishId,
      "RECIPE",
      versionId,
    );
  } catch (error) {
    if (error instanceof NotFoundError) {
      notFound();
    }
    throw error;
  }

  const backHref = versionId
    ? `/recipes/${dishId}/versions/${versionId}`
    : `/recipes/${dishId}`;

  return (
    <>
      <PrintToolbar backHref={backHref} backLabel="Back to recipe" />
      <PrintDocument
        content={result.content}
        kindLabel="Recipe"
        historicalNote={
          result.isCurrent
            ? undefined
            : "Historical version — this content is frozen and will not change."
        }
        imageSrc={(assetId) => `/api/images/${assetId}`}
      />
    </>
  );
}

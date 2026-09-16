import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { getOwnedSessionOrThrow, getSessionSourceSummary } from "@/lib/cooking/queries";
import { buildCookingModeSessionProps } from "@/lib/cooking/session-view";
import { NotFoundError } from "@/lib/errors";
import { CookingModeOfflineBoundary } from "@/components/domain/cooking/cooking-mode-offline-boundary";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}): Promise<Metadata> {
  const session = await getServerSession();
  if (!session) return {};
  const { sessionId } = await params;
  try {
    const cookingSession = await getOwnedSessionOrThrow(
      session.user.id,
      sessionId,
    );
    const sourceSummary = await getSessionSourceSummary(
      cookingSession.dishId,
      cookingSession.dishVersionId,
    );
    return {
      title: `${sourceSummary.dishTitle} — Cooking mode`,
    };
  } catch {
    return {};
  }
}

export default async function CookingModePage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ unit?: string }>;
}) {
  const session = await getServerSession();
  if (!session) redirect("/sign-in");

  const { sessionId } = await params;
  const { unit: focusedUnitIdParam } = await searchParams;

  let props;
  try {
    props = await buildCookingModeSessionProps(session.user.id, sessionId);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  return (
    <CookingModeOfflineBoundary
      serverProps={props}
      initialFocusedUnitId={focusedUnitIdParam ?? null}
    />
  );
}

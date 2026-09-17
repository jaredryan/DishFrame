import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { NotFoundError } from "@/lib/errors";
import { getOwnedSessionForReview } from "@/lib/reviews/queries";
import { buildSessionReviewProps } from "@/lib/reviews/session-review-view";
import { SessionReviewOfflineBoundary } from "@/components/domain/cooking/session-review-offline-boundary";
import { OFFLINE_SHELL_SENTINEL } from "@/lib/offline/shell-sentinel";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}): Promise<Metadata> {
  const session = await getServerSession();
  if (!session) return {};
  const { sessionId } = await params;
  try {
    const { dish } = await getOwnedSessionForReview(session.user.id, sessionId);
    return { title: `${dish?.currentTitle ?? "Deleted item"} — Review` };
  } catch {
    return {};
  }
}

export default async function SessionReviewPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  if (sessionId === OFFLINE_SHELL_SENTINEL) {
    return (
      <div className="bg-background mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-4 py-6">
        <SessionReviewOfflineBoundary serverProps={null} />
      </div>
    );
  }

  const session = await getServerSession();
  if (!session) redirect("/sign-in");

  let owned;
  try {
    owned = await getOwnedSessionForReview(session.user.id, sessionId);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const { session: cookingSession } = owned;

  // PRODUCT_SPEC.md §33.1: a Review is only available once the session has
  // reached an outcome.
  if (cookingSession.state === "IN_PROGRESS") {
    redirect(`/cook/${sessionId}`);
  }

  const reviewProps = await buildSessionReviewProps(session.user.id, sessionId);

  return (
    <div className="bg-background mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-4 py-6">
      <SessionReviewOfflineBoundary serverProps={reviewProps} />
    </div>
  );
}

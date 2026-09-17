import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { getOwnedGroceryListOrThrow } from "@/lib/grocery/queries";
import { buildGroceryListViewProps } from "@/lib/grocery/list-view";
import { NotFoundError } from "@/lib/errors";
import { GroceryListOfflineBoundary } from "@/components/domain/grocery/grocery-list-offline-boundary";
import { OFFLINE_SHELL_SENTINEL } from "@/lib/offline/shell-sentinel";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const session = await getServerSession();
  if (!session) return {};
  const { id } = await params;
  try {
    const list = await getOwnedGroceryListOrThrow(session.user.id, id);
    return { title: list.title };
  } catch {
    return {};
  }
}

export default async function GroceryListDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (id === OFFLINE_SHELL_SENTINEL) {
    return <GroceryListOfflineBoundary serverProps={null} />;
  }

  const session = await getServerSession();
  if (!session) redirect("/sign-in");

  let props;
  try {
    props = await buildGroceryListViewProps(session.user.id, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  return <GroceryListOfflineBoundary serverProps={props} />;
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getServerSession } from "@/lib/auth/session";
import { listTagsWithUsageCount } from "@/lib/tags/queries";
import { TagManager } from "@/components/app/tag-manager";

export const metadata: Metadata = {
  title: "Tags",
};

export default async function TagsPage() {
  const session = await getServerSession();
  if (!session) {
    redirect("/sign-in");
  }

  const tags = await listTagsWithUsageCount(session.user.id);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <div>
        <Link
          href="/settings"
          className="text-muted-foreground mb-2 inline-flex items-center gap-1 text-sm hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Settings
        </Link>
        <h1 className="font-heading text-foreground text-2xl font-semibold">
          Tags
        </h1>
        <p className="text-muted-foreground mt-2">
          Your own organizing labels — used for filtering Recipes and Parts.
        </p>
      </div>

      <TagManager initialTags={tags} />
    </div>
  );
}

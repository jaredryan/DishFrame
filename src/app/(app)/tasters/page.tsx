import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getServerSession } from "@/lib/auth/session";
import { listTasters } from "@/lib/tasters/queries";
import { TasterManager } from "@/components/app/taster-manager";

export const metadata: Metadata = {
  title: "Tasters",
};

export default async function TastersPage() {
  const session = await getServerSession();
  if (!session) {
    redirect("/sign-in");
  }

  const tasters = await listTasters(session.user.id);

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
          Tasters
        </h1>
        <p className="text-muted-foreground mt-2">
          Who tried it? Add the people whose ratings you want to remember.
        </p>
      </div>

      <TasterManager initialTasters={tasters} />
    </div>
  );
}

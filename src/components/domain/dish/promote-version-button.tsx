"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { promoteHistoricalVersion } from "@/lib/dishes/actions";
import { dishBasePath } from "@/components/domain/dish/dish-card";
import type { DishKindValue } from "@/lib/dishes/schema";

/**
 * PRODUCT_SPEC.md §13.2/§13.7: "revival of a useful historical direction
 * as the next main Recipe" — a verbatim copy of this Version's content
 * into a brand-new major Version, with no content edits. Distinct from
 * editing-then-choosing-a-new-version: this is for when the historical
 * content itself, unchanged, is exactly what should become current again.
 */
export function PromoteVersionButton({
  kind,
  dishId,
  versionId,
  newMajorLabel,
}: {
  kind: DishKindValue;
  dishId: string;
  versionId: string;
  newMajorLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();
  const { showToast } = useToast();

  function handlePromote() {
    startTransition(async () => {
      const result = await promoteHistoricalVersion(kind, {
        dishId,
        versionId,
      });
      if (result.status === "success") {
        setOpen(false);
        router.push(`${dishBasePath(kind)}/${dishId}`);
        router.refresh();
      } else {
        showToast({
          variant: "error",
          title: result.message ?? "Could not promote this version.",
        });
      }
    });
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Promote to a new version
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChangeAction={(next) => !isPending && setOpen(next)}
        title="Make this direction current again?"
        description={
          <>
            Creates {newMajorLabel} with this version&apos;s content exactly as
            it is, and makes it the current version. Nothing about this
            historical version changes.
          </>
        }
        confirmLabel="Promote"
        loading={isPending}
        onConfirmAction={handlePromote}
      />
    </>
  );
}

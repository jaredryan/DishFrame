"use client";

import * as React from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DirectShareCollectionDialog } from "@/components/domain/sharing/direct-share-collection-dialog";

/** PRODUCT_SPEC.md §85 extension (Slice 22): the `/share` page's primary
 * send action, opening the unified flow with nothing preselected. */
export function SendRecipesButton() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Send aria-hidden="true" />
        Send Recipes
      </Button>
      <DirectShareCollectionDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

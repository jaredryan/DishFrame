"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Send, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DirectShareCollectionDialog } from "@/components/domain/sharing/direct-share-collection-dialog";
import { BulkPublishDialog } from "@/components/domain/sharing/bulk-publish-dialog";

type DialogKind = "send" | "publish" | null;

/**
 * `/share`'s primary action: a "Share" dropdown (same interaction concept
 * as the Home dashboard's "+ Create" menu — `create-dish-menu.tsx`) rather
 * than a single button, since this entry point covers both of the
 * generalized multi-item flows — Send and Publish.
 */
export function ShareMenuButton() {
  const router = useRouter();
  const [openDialog, setOpenDialog] = React.useState<DialogKind>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>
            <Share2 aria-hidden="true" />
            Share
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-fit">
          <DropdownMenuItem onSelect={() => setOpenDialog("send")}>
            <Send /> Send
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setOpenDialog("publish")}>
            <Share2 /> Publish
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DirectShareCollectionDialog
        open={openDialog === "send"}
        onOpenChange={(open) => !open && setOpenDialog(null)}
      />
      <BulkPublishDialog
        open={openDialog === "publish"}
        onOpenChange={(open) => !open && setOpenDialog(null)}
        onPublished={() => router.refresh()}
      />
    </>
  );
}

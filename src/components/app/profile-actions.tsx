"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LogOut, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/client";

// Appearance/theme lives only in /settings (Gate 2 final correction pass —
// this page previously duplicated it). Profile stays focused on identity,
// authentication, and account actions.
export function ProfileActions() {
  const router = useRouter();
  const [signingOut, setSigningOut] = React.useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <>
      <section className="flex flex-col gap-4">
        <h2 className="text-foreground text-lg font-semibold">
          Export my data
        </h2>
        <div className="border-border bg-card flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground text-sm">
            Downloads a structured export of your account data — Recipes, Parts,
            Cooking Sessions, Cooking notes, Session Reviews, and Taster data
            included, as JSON. This is a data export, not a restorable backup:
            image files aren&apos;t included, and there&apos;s no import path
            back into DishFrame yet. Keep the file private.
          </p>
          <Button variant="outline" asChild className="self-start sm:self-auto">
            <a href="/api/export/account" download>
              <Download />
              Export
            </a>
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-foreground text-lg font-semibold">Sign out</h2>
        <div className="border-border bg-card flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground text-sm">
            End your session on this device.
          </p>
          <Button
            variant="outline"
            disabled={signingOut}
            onClick={handleSignOut}
            className="self-start sm:self-auto"
          >
            <LogOut />
            {signingOut ? "Signing out…" : "Sign out"}
          </Button>
        </div>
      </section>
    </>
  );
}

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { signOut } from "@/lib/auth/client";

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
    <div className="flex flex-col gap-6">
      <div className="border-border bg-card flex items-center justify-between rounded-xl border p-4">
        <div>
          <p className="text-foreground text-sm font-medium">Theme</p>
          <p className="text-muted-foreground text-sm">
            Light, dark, or match your system.
          </p>
        </div>
        <ThemeToggle />
      </div>

      <div className="border-border bg-card flex items-center justify-between rounded-xl border p-4">
        <div>
          <p className="text-foreground text-sm font-medium">Sign out</p>
          <p className="text-muted-foreground text-sm">
            End your session on this device.
          </p>
        </div>
        <Button variant="outline" disabled={signingOut} onClick={handleSignOut}>
          <LogOut />
          {signingOut ? "Signing out…" : "Sign out"}
        </Button>
      </div>

      <div className="border-destructive/30 bg-destructive/5 flex items-center justify-between rounded-xl border p-4">
        <div>
          <p className="text-foreground text-sm font-medium">Delete account</p>
          <p className="text-muted-foreground text-sm">Not available yet.</p>
        </div>
        <Button variant="destructive" disabled>
          Delete account
        </Button>
      </div>
    </div>
  );
}

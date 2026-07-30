"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, User as UserIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/lib/auth/client";
import { cn } from "@/lib/utils";

type AccountUser = {
  name: string;
  email: string;
  image?: string | null;
};

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

export function AccountMenu({
  user,
  className,
}: {
  user: AccountUser;
  className?: string;
}) {
  const router = useRouter();
  const [signingOut, setSigningOut] = React.useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "focus-visible:ring-ring/50 flex cursor-pointer items-center gap-2 rounded-full focus-visible:ring-2 focus-visible:outline-none",
            className,
          )}
          aria-label="Account menu"
        >
          <Avatar>
            <AvatarImage src={user.image ?? undefined} alt="" />
            <AvatarFallback>{initials(user.name)}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-0.5 py-1.5">
          <span className="text-foreground text-sm font-medium">
            {user.name}
          </span>
          <span className="text-muted-foreground truncate text-xs font-normal">
            {user.email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="cursor-pointer">
          <Link href="/profile">
            <UserIcon />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={signingOut}
          className="cursor-pointer"
          onSelect={(event) => {
            event.preventDefault();
            handleSignOut();
          }}
        >
          <LogOut />
          {signingOut ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

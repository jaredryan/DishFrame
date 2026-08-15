"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronUp, LogOut, User as UserIcon } from "lucide-react";
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
import { initials } from "@/lib/format/initials";

type AccountUser = {
  name: string;
  email: string;
  image?: string | null;
};

export function AccountMenu({
  user,
  className,
  // "sidebar" is the desktop left-nav placement (item row with the email
  // visible, menu opening upward since the trigger sits at the bottom of
  // the viewport); "icon" is the original avatar-only trigger still used by
  // the mobile topbar.
  variant = "icon",
}: {
  user: AccountUser;
  className?: string;
  variant?: "icon" | "sidebar";
}) {
  const router = useRouter();
  const [signingOut, setSigningOut] = React.useState(false);
  const userInitials = initials(user.name);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    router.push("/");
    router.refresh();
  }

  const trigger =
    variant === "sidebar" ? (
      <button
        type="button"
        className={cn(
          "group focus-visible:ring-ring/50 hover:bg-sidebar-accent data-[state=open]:bg-sidebar-accent/40 data-[state=open]:hover:bg-sidebar-accent flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none",
          className,
        )}
      >
        <Avatar aria-hidden="true" className="size-8 shrink-0">
          <AvatarImage src={user.image ?? undefined} alt="" />
          <AvatarFallback>{userInitials}</AvatarFallback>
        </Avatar>
        <span className="text-sidebar-foreground min-w-0 flex-1 truncate text-sm font-medium">
          {user.email}
        </span>
        <ChevronUp
          className="text-sidebar-foreground/60 size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180"
          aria-hidden="true"
        />
      </button>
    ) : (
      <button
        type="button"
        className={cn(
          "group focus-visible:ring-ring/50 -m-0.5 flex cursor-pointer items-center gap-2 rounded-full p-0.5 focus-visible:ring-2 focus-visible:outline-none",
          className,
        )}
        aria-label={`${userInitials}, account menu`}
      >
        <Avatar
          aria-hidden="true"
          // Subtler than a flat dark overlay, but still a clearly visible
          // shift — applies to the whole Avatar (image or initials
          // fallback alike) whether hovered or open, now that the shared
          // DropdownMenu default (`modal={false}`) lets hover keep working
          // on the trigger while its menu is open.
          className="transition-[filter] duration-150 group-hover:brightness-90 group-data-[state=open]:brightness-90 dark:group-hover:brightness-115 dark:group-data-[state=open]:brightness-115"
        >
          <AvatarImage src={user.image ?? undefined} alt="" />
          <AvatarFallback>{userInitials}</AvatarFallback>
        </Avatar>
      </button>
    );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align={variant === "sidebar" ? "start" : "end"}
        side={variant === "sidebar" ? "top" : "bottom"}
        className="w-64"
      >
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

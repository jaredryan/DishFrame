import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";

/**
 * ARCHITECTURE_PROPOSAL.md §C.8 — Cooking Mode's dedicated layout, deliberately
 * outside the `(app)` route group so it does not inherit `SidebarNav`/
 * `MobileTopbar`/the account header: no sidebar, minimal chrome, full
 * viewport devoted to the focused unit. `CookingModeShell` renders its own
 * compact top bar (title, elapsed time, End cooking session) as page
 * content, not layout chrome, since that needs the session data the page
 * component already fetches.
 */
export default async function CookLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession();
  if (!session) redirect("/sign-in");

  return <div className="bg-background min-h-dvh">{children}</div>;
}

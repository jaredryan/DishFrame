import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChefHat, Clock } from "lucide-react";
import { getServerSession } from "@/lib/auth/session";
import { listSessionsForOwner } from "@/lib/cooking/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Cooking sessions" };

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

function formatAge(date: Date): string {
  const ms = Date.now() - date.getTime();
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 1) return "Just started";
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

// react-hooks/purity: `Date.now()` must not be called directly inside a
// component's render body — kept in this plain helper (like `formatAge`
// above) rather than inline in the JSX map below.
function isStale(startedAt: Date): boolean {
  return Date.now() - startedAt.getTime() > STALE_THRESHOLD_MS;
}

export default async function CookingSessionsIndexPage() {
  const session = await getServerSession();
  if (!session) redirect("/sign-in");

  const { active, recentEnded } = await listSessionsForOwner(session.user.id);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="font-heading text-foreground text-2xl font-semibold">
        Cooking sessions
      </h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
          Active
        </h2>
        {active.length === 0 && (
          <p className="text-muted-foreground text-sm">
            No Cooking Sessions in progress.
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {active.map((s) => {
            const stale = isStale(s.startedAt);
            return (
              <li
                key={s.id}
                className="border-border bg-card flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <p className="text-foreground truncate text-sm font-medium">
                    {s.dishTitle}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge
                      variant="outline"
                      className={
                        stale
                          ? "border-orange-500/40 text-orange-600 dark:text-orange-400"
                          : undefined
                      }
                    >
                      <Clock className="size-3" aria-hidden="true" />
                      {formatAge(s.startedAt)}
                    </Badge>
                    {s.dishKind && (
                      <Badge variant="outline">
                        {s.dishKind === "PART" ? "Part" : "Recipe"}
                      </Badge>
                    )}
                  </div>
                </div>
                <Button asChild size="sm">
                  <Link href={`/cook/${s.id}`}>Resume</Link>
                </Button>
              </li>
            );
          })}
        </ul>
      </section>

      {recentEnded.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
            Recently ended
          </h2>
          <ul className="flex flex-col gap-2">
            {recentEnded.map((s) => (
              <li
                key={s.id}
                className="border-border flex items-center justify-between gap-3 rounded-lg border border-dashed p-3"
              >
                <div className="min-w-0">
                  <p className="text-foreground truncate text-sm font-medium">
                    {s.dishTitle}
                  </p>
                  <Badge variant="outline">
                    {s.state === "COMPLETED" ? "Completed" : "Ended early"}
                  </Badge>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/cook/${s.id}`}>View</Link>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {active.length === 0 && recentEnded.length === 0 && (
        <div className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center text-sm">
          <ChefHat className="size-8" aria-hidden="true" />
          <p>
            Open a Recipe or Part and choose{" "}
            <span className="text-foreground font-medium">Cook</span> to start
            your first Cooking Session.
          </p>
        </div>
      )}
    </div>
  );
}

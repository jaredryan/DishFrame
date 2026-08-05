import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import {
  listGroceryListsForOwner,
  listGrocerySourceCandidates,
} from "@/lib/grocery/queries";
import { GrocerySourcePicker } from "@/components/domain/grocery/grocery-source-picker";
import { CoachMark } from "@/components/onboarding/coach-mark";

export const metadata: Metadata = { title: "Grocery lists" };

function ListRow({
  list,
}: {
  list: {
    id: string;
    title: string;
    createdAt: Date;
    _count: { items: number };
  };
}) {
  return (
    <li key={list.id}>
      <Link
        href={`/grocery-lists/${list.id}`}
        className="border-border bg-card hover:bg-muted/50 flex items-center justify-between gap-4 rounded-lg border p-3 transition-colors"
      >
        <div>
          <p className="text-foreground text-sm font-medium">{list.title}</p>
          <p className="text-muted-foreground text-xs">
            {list.createdAt.toLocaleDateString()} · {list._count.items} item
            {list._count.items === 1 ? "" : "s"}
          </p>
        </div>
      </Link>
    </li>
  );
}

export default async function GroceryListsPage() {
  const session = await getServerSession();
  if (!session) redirect("/sign-in");

  const [{ active, completed }, candidates] = await Promise.all([
    listGroceryListsForOwner(session.user.id),
    listGrocerySourceCandidates(session.user.id),
  ]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="font-heading text-foreground text-2xl font-semibold">
          Grocery lists
        </h1>
        <p className="text-muted-foreground mt-2 max-w-xl">
          Generate a shopping list from your Recipes and Parts, combine
          equivalent items, and check them off as you shop.
        </p>
      </div>

      <CoachMark guideKey="grocery-lists-intro" title="Grocery Lists">
        Generate a list from one or more Recipes/Parts, or from a Meal Plan.
        Equivalent items combine automatically, and checking items off here
        never changes the Recipe or Part itself.
      </CoachMark>

      <GrocerySourcePicker candidates={candidates} />

      <div className="flex flex-col gap-2">
        <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Active
        </h2>
        {active.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No active grocery lists yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {active.map((list) => (
              <ListRow key={list.id} list={list} />
            ))}
          </ul>
        )}
      </div>

      {completed.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Completed
          </h2>
          <ul className="flex flex-col gap-2">
            {completed.map((list) => (
              <ListRow key={list.id} list={list} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
  description:
    "Learn how DishFrame helps home cooks organize recipes, reuse familiar preparations, and improve dishes over time.",
  alternates: {
    canonical: "/about",
  },
  openGraph: {
    url: "/about",
    title: "About | DishFrame",
    description:
      "Learn how DishFrame helps home cooks organize recipes, reuse familiar preparations, and improve dishes over time.",
  },
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <h1 className="font-heading text-foreground text-3xl font-semibold sm:text-4xl">
        About DishFrame
      </h1>
      <p className="text-muted-foreground mt-6 text-lg text-pretty">
        DishFrame began with a simple idea: cooking does not end when the meal
        is served. Every time you make something, you learn what worked, what
        changed, who liked it, and what you want to do differently next time.
      </p>

      <div className="border-border bg-card mt-12 rounded-2xl border p-8">
        <h2 className="font-heading text-foreground text-xl font-semibold">
          More workshop than recipe box
        </h2>
        <p className="text-muted-foreground mt-4">
          DishFrame helps you keep the preparations you use often, organize
          complete recipes around them, and preserve each version as your
          cooking changes.
        </p>
      </div>

      <div className="text-muted-foreground mt-12 space-y-4">
        <p>
          Most recipe tools treat every dish as a fresh start. DishFrame treats
          your cooking as something that accumulates: a sauce you nailed once
          can anchor the next five recipes, and a recipe you keep changing can
          hold onto every version instead of overwriting what came before.
        </p>
        <p>
          It is still early. This foundation exists so the parts that make
          DishFrame useful — recipes, reusable parts, versions, and cooking
          history — can be built on solid, honest ground rather than guessed at
          all at once.
        </p>
      </div>
    </div>
  );
}

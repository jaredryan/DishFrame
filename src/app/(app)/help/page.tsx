import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Help",
};

const CONCEPTS = [
  {
    term: "Recipe",
    body: "A complete dish, made up of one or more sections.",
  },
  {
    term: "Section",
    body: "A part of a recipe or cooking session, like Sauce, Rice, or Chicken. A section can be written just for that recipe, or linked to a saved part.",
  },
  {
    term: "Part",
    body: "A preparation you save on its own and reuse across more than one recipe — a sauce, a side, a staple.",
  },
  {
    term: "Version",
    body: "A saved snapshot of a recipe as it changes over time, so earlier attempts aren't lost when you try something new.",
  },
  {
    term: "Cooking Session",
    body: "One period of actually cooking a recipe, from starting to finishing the sections you chose for that day.",
  },
];

const COMING_LATER = [
  "Creating and importing recipes",
  "Saving and reusing parts",
  "Cooking sessions and session reviews",
  "Meal planning and grocery lists",
];

export default function HelpPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10">
      <div>
        <h1 className="font-heading text-foreground text-2xl font-semibold">
          Help
        </h1>
        <p className="text-muted-foreground mt-2">
          DishFrame is a framework for organizing, cooking, and improving the
          dishes you make. It keeps recipes organized into sections, lets you
          reuse preparations across recipes, and remembers what you learn each
          time you cook.
        </p>
      </div>

      <div>
        <h2 className="font-heading text-foreground text-lg font-semibold">
          Key terms
        </h2>
        <dl className="mt-4 flex flex-col gap-4">
          {CONCEPTS.map(({ term, body }) => (
            <div
              key={term}
              className="border-border bg-card rounded-xl border p-4"
            >
              <dt className="font-heading text-foreground text-sm font-semibold">
                {term}
              </dt>
              <dd className="text-muted-foreground mt-1 text-sm">{body}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div>
        <h2 className="font-heading text-foreground text-lg font-semibold">
          Coming later
        </h2>
        <p className="text-muted-foreground mt-2 text-sm">
          This first version of DishFrame is the foundation: sign-in, the
          overall shell, and these placeholder pages. The following are not
          built yet.
        </p>
        <ul className="mt-4 flex flex-col gap-2">
          {COMING_LATER.map((item) => (
            <li
              key={item}
              className="text-muted-foreground flex items-center gap-2 text-sm"
            >
              <span
                className="bg-border size-1.5 shrink-0 rounded-full"
                aria-hidden="true"
              />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { ReplayableGuideList } from "@/components/onboarding/replayable-guide-list";

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
    term: "Stage",
    body: "How far along a recipe or part is — Idea, Testing, Keeper, and so on — tracked separately from its content.",
  },
  {
    term: "Cooking Session",
    body: "One period of actually cooking a recipe, from starting to finishing the sections you chose for that day.",
  },
  {
    term: "Session Review",
    body: "An optional, conversational record of how a cooking session went — what worked, what didn't, and how it actually tasted.",
  },
  {
    term: "Taster",
    body: "Someone whose ratings you want to remember — yourself or anyone who tries what you cook.",
  },
  {
    term: "Flavor Profile",
    body: "A dedicated classification for how something tastes, separate from your own organizing tags.",
  },
  {
    term: "Meal Plan",
    body: "A batch of planned meals across a date range, each pointing at an exact Recipe/Part Version.",
  },
  {
    term: "Grocery List",
    body: "A shopping list generated from one or more Recipes/Parts (or a Meal Plan), with equivalent items combined.",
  },
  {
    term: "Share Link",
    body: "A read-only, unlisted URL for a Recipe or Part — no account needed to view. Can be frozen to one Version, or set to keep following the current Version.",
  },
  {
    term: "Direct Share",
    body: "Sending a Recipe or Part to one specific DishFrame account, who can accept or decline it.",
  },
  {
    term: "Independent copy",
    body: "What a viewer/recipient gets by explicitly saving (or accepting) a shared item — never created just by viewing a link. It's their own copy, which never syncs with the original again in either direction.",
  },
  {
    term: "Nutrition basis",
    body: "Whether entered/looked-up nutrition values describe the whole Recipe/Part, or a single serving/output unit.",
  },
];

const FAQS = [
  {
    question: "Does editing a recipe overwrite the old version?",
    answer:
      "No. Saving a change either refines the current Version or starts a new one — the earlier attempt stays in the recipe's Version history, and you can compare any two Versions side by side.",
  },
  {
    question: "What's the difference between a Section and a Part?",
    answer:
      "A Section is written for one specific Recipe. A Part is the same idea, but saved on its own so you can link it into more than one Recipe without retyping it — editing the Part can update every Recipe that links it.",
  },
  {
    question: "If I share a recipe, can the other person mess up my copy?",
    answer:
      "No — sharing gives the recipient their own independent copy. Nothing either of you does afterward changes the other's copy.",
  },
  {
    question: "Will DishFrame add sample recipes to my library?",
    answer:
      "No. The example shown during the welcome introduction is clearly fictional and never saved — it disappears when the introduction ends. DishFrame never writes anything to your library on its own.",
  },
  {
    question: "How does nutrition entry work?",
    answer:
      "Enter it manually, or search USDA FoodData Central and apply a match. Either way, you choose whether the numbers describe the whole Recipe/Part or a single serving/output unit (the Nutrition basis) — DishFrame never guesses this for you.",
  },
  {
    question:
      "Does a Meal Plan's grocery list stay updated if I change the plan?",
    answer:
      "Yes — a grocery list linked to a Meal Plan stays synchronized (added/removed entries, changed yields or Versions) while both remain active. Completing the list freezes it as a historical record, so later plan changes stop affecting it.",
  },
];

const DIRECT_LINKS = [
  { label: "Recipes", href: "/recipes" },
  { label: "Reusable Parts", href: "/parts" },
  { label: "Cooking sessions", href: "/cook" },
  { label: "Meal plans", href: "/meal-plans" },
  { label: "Grocery lists", href: "/grocery-lists" },
  { label: "Sharing", href: "/share" },
  { label: "Settings & preferences", href: "/settings" },
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
          Jump to
        </h2>
        <ul className="mt-4 flex flex-wrap gap-2">
          {DIRECT_LINKS.map(({ label, href }) => (
            <li key={href}>
              <Link
                href={href}
                className="border-border bg-card hover:bg-muted text-foreground rounded-lg border px-3 py-1.5 text-sm"
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h2 className="font-heading text-foreground text-lg font-semibold">
          Guides
        </h2>
        <p className="text-muted-foreground mt-2 text-sm">
          Replay any of the contextual explanations you&apos;ve already seen (or
          skipped) elsewhere in DishFrame.
        </p>
        <div className="mt-4">
          <ReplayableGuideList />
        </div>
      </div>

      <div>
        <h2 className="font-heading text-foreground text-lg font-semibold">
          FAQs
        </h2>
        <dl className="mt-4 flex flex-col gap-4">
          {FAQS.map(({ question, answer }) => (
            <div
              key={question}
              className="border-border bg-card rounded-xl border p-4"
            >
              <dt className="font-heading text-foreground text-sm font-semibold">
                {question}
              </dt>
              <dd className="text-muted-foreground mt-1 text-sm">{answer}</dd>
            </div>
          ))}
        </dl>
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
    </div>
  );
}

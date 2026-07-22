import Link from "next/link";
import {
  ArrowRight,
  ChevronRight,
  Layers,
  NotebookPen,
  CalendarRange,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeroVisual } from "@/components/marketing/hero-visual";

const PILLARS = [
  {
    icon: Layers,
    title: "Reuse what you already know",
    body: "Save the sauces, grains, proteins, sides, and toppings you make often, then use them across any recipe.",
  },
  {
    icon: NotebookPen,
    title: "Learn from every meal",
    body: "Keep ratings and notes from each time you cook, so you remember what worked and what you want to change.",
  },
  {
    icon: CalendarRange,
    title: "Plan from what works",
    body: "Organize recipes your way, keep track of what you're still practicing, and use recent meals to decide what belongs in the week ahead.",
  },
];

const LOOP_STEPS = ["Organize", "Cook", "Review", "Improve"];

export default function MarketingHomePage() {
  return (
    <>
      <section className="mx-auto grid max-w-6xl gap-12 px-4 pt-16 pb-20 sm:px-6 sm:pt-20 sm:pb-28 lg:grid-cols-2 lg:items-center lg:gap-8 lg:px-8">
        <div className="flex flex-col items-start gap-6">
          <h1 className="font-heading text-foreground max-w-xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            A better framework for the way you cook.
          </h1>
          <p className="text-muted-foreground max-w-lg text-lg text-pretty">
            Keep recipes organized, reuse what already works, and save what you
            learn each time you cook.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <Link href="/sign-in">
                Start building
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="#pillars">Learn more</Link>
            </Button>
          </div>
        </div>
        <HeroVisual />
      </section>

      <section
        id="pillars"
        className="border-border bg-surface-subtle border-t"
      >
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {PILLARS.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="border-border bg-card flex flex-col gap-4 rounded-2xl border p-6"
              >
                <div className="bg-primary/10 flex size-10 items-center justify-center rounded-lg">
                  <Icon className="text-primary size-5" aria-hidden="true" />
                </div>
                <h2 className="font-heading text-foreground text-lg font-semibold">
                  {title}
                </h2>
                <p className="text-muted-foreground text-sm">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
        <h2 className="font-heading text-foreground text-center text-2xl font-semibold">
          The DishFrame loop
        </h2>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-2 gap-y-4">
          {LOOP_STEPS.map((step, index) => (
            <div key={step} className="flex items-center gap-2">
              <span className="border-border bg-card text-foreground rounded-full border px-5 py-2.5 text-sm font-medium">
                {step}
              </span>
              {index < LOOP_STEPS.length - 1 && (
                <ChevronRight
                  className="text-muted-foreground size-5"
                  aria-hidden="true"
                />
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="border-border border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-20 text-center sm:px-6 lg:px-8">
          <h2 className="font-heading text-foreground max-w-xl text-3xl font-semibold text-balance">
            Start organizing the way you actually cook.
          </h2>
          <Button size="lg" asChild>
            <Link href="/sign-in">
              Start building
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}

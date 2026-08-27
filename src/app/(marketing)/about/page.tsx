import type { Metadata } from "next";
import { CalendarDays, ChefHat, History, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { AboutHeroVisual } from "@/components/marketing/about-hero-visual";
import { PartsMoment } from "@/components/marketing/parts-moment";
import { PlanMoment } from "@/components/marketing/plan-moment";
import { CookMoment } from "@/components/marketing/cook-moment";
import { ImproveMoment } from "@/components/marketing/improve-moment";
import { ClosingCta } from "@/components/marketing/closing-cta";
import {
  AboutFrameworkThreadSegment,
  type ThreadAccent,
} from "@/components/marketing/about-framework-thread";

// PROTOTYPE: pairs with AboutFrameworkThreadSegment below — remove both
// (and this accents array) if this doesn't earn its place.
const THREAD_ACCENTS: ThreadAccent[] = ["blue", "orange", "green", "violet"];

export const metadata: Metadata = {
  title: "About",
  description:
    "Why DishFrame exists: recipes change as people cook them, and a working recipe should hold onto what was learned along the way.",
  alternates: {
    canonical: "/about",
  },
  openGraph: {
    url: "/about",
    title: "About | DishFrame",
    description:
      "Why DishFrame exists: recipes change as people cook them, and a working recipe should hold onto what was learned along the way.",
  },
};

const PROBLEMS = [
  {
    number: "1",
    accent: "primary" as const,
    title: "Hard to use while cooking",
    body: "Recipes often lived in scattered personal notes or inside an app as one long block of text. While cooking, that meant scrolling up and down to find the right ingredient group, a sauce instruction, a timing note, the preparation for one part of the dish, or the next step. Saving a Recipe did not automatically make it easy to cook from.",
    response:
      "DishFrame breaks a Recipe into clear Sections, helps you prepare before you begin, and gives you a Cooking Mode designed to be followed in the kitchen.",
  },
  {
    number: "2",
    accent: "orange" as const,
    title: "Hard to improve and keep updated",
    body: "Cooking can be experimental. There was no easy way to track how each experiment and piece of feedback panned out. The usual choices were to overwrite the old Recipe, scatter more observations into separate notes, or try to recall what happened last time. Repeated Parts made this worse. If the white rice, sauce, or topping changed, every Recipe using it had to be edited separately.",
    response:
      "Cooking Sessions record what happened. Ratings capture the result. Versions preserve meaningful Recipe changes. Reusable Parts let one improved preparation update every Recipe that uses it.",
  },
];

const PROBLEM_STYLES = {
  primary: {
    // Text-safe accent at 65% opacity: composited against the card, this
    // clears 3:1 in both themes (--brand-blue itself can't, even opaque,
    // against the dark-mode card — see the accessibility follow-up pass).
    numeral: "text-brand-blue-text/65",
    callout: "border-primary bg-primary/5 text-foreground",
  },
  orange: {
    numeral: "text-brand-orange-text/65",
    callout: "border-brand-orange bg-brand-orange/5 text-foreground",
  },
};

const STEPS = [
  {
    title: "Build it your way",
    accent: "text-primary",
    ring: "border-primary bg-primary/10",
    icon: Layers,
    body: "Every Recipe starts as Sections — Sauce, Rice, Chicken, Finish, however the dish actually breaks down. A simple weeknight bowl can stay a single Section. A multi-part dinner can spread across as many as it needs, without forcing a shape that doesn't fit. When a preparation repeats — a sauce, a grain, a topping — save it as a reusable Part. Update the Part once, and every Recipe built on it picks up the change.",
    Visual: PartsMoment,
  },
  {
    title: "Plan the week ahead",
    accent: "text-brand-orange",
    ring: "border-brand-orange bg-brand-orange/10",
    icon: CalendarDays,
    body: "Meal Plans turn the Recipes you already trust into a week you can actually follow. Choose what you want to cook, place each one into the days ahead, and DishFrame turns the plan into a single Grocery List — no rebuilding the list by hand, no double-checking what's already accounted for.",
    Visual: PlanMoment,
  },
  {
    title: "Cook without losing your place",
    accent: "text-brand-green",
    ring: "border-brand-green bg-brand-green/10",
    icon: ChefHat,
    body: "Cooking Setup lets you choose which Sections you're making today and gather what you need before you start. Cooking Mode then keeps that plan close while you work — clear steps, checkoffs, and timers grouped by the part of the dish you're actually preparing, so you're never scrolling back through a wall of text to find where you left off.",
    Visual: CookMoment,
  },
  {
    title: "Improve it each time",
    accent: "text-brand-violet",
    ring: "border-brand-violet bg-brand-violet/10",
    icon: History,
    body: "Every Cooking Session is a chance to capture what happened — notes, outcomes, a rating, whatever's worth remembering. When a change is worth keeping, save it as a new Version, and the Recipe carries that improvement forward while the path that got you there stays intact. Reusable Parts complete the loop: improve one preparation, and every Recipe that uses it improves too.",
    Visual: ImproveMoment,
  },
];

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <div className="mx-auto grid w-full max-w-5xl gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[9fr_11fr] lg:items-center lg:gap-16 lg:px-8">
        <div className="mx-auto max-w-xl text-left lg:order-last lg:mx-0 lg:max-w-md">
          <span className="text-primary text-sm font-semibold tracking-wide uppercase">
            Why DishFrame exists
          </span>
          <h1 className="font-heading text-foreground mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Dishes aren&rsquo;t finished. They&rsquo;re learned.
          </h1>
          <p className="text-muted-foreground mt-6 text-lg text-pretty">
            Timing changes. Ingredients get adjusted. A preparation becomes
            easier to follow. A family favorite gets a little better each time
            it returns to the table.
          </p>
        </div>

        <div className="flex justify-center lg:order-first lg:justify-start">
          <AboutHeroVisual />
        </div>
      </div>

      {/* Two problems */}
      <section className="border-border bg-surface-subtle border-t">
        <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-20 sm:px-6 lg:block lg:max-w-5xl lg:px-8">
          <h2 className="font-heading text-foreground text-2xl font-semibold sm:text-3xl">
            DishFrame started with two problems that kept getting in the way.
          </h2>
          <div className="mt-10 grid gap-6 lg:grid-cols-2 lg:gap-8">
            {PROBLEMS.map((problem) => {
              const styles = PROBLEM_STYLES[problem.accent];
              return (
                <div
                  key={problem.number}
                  className="border-border bg-card relative flex flex-col gap-5 overflow-hidden rounded-2xl border p-8 shadow-sm"
                >
                  <span
                    className={cn(
                      "font-heading pointer-events-none absolute -top-2 right-4 text-5xl font-bold select-none",
                      styles.numeral,
                    )}
                    aria-hidden="true"
                  >
                    {problem.number}
                  </span>
                  <h2 className="font-heading text-foreground relative text-xl font-semibold sm:text-2xl">
                    {problem.title}
                  </h2>
                  <p className="text-muted-foreground text-pretty">
                    {problem.body}
                  </p>
                  <p
                    className={cn(
                      "rounded-lg border-l-4 py-2 pl-4 text-sm font-medium text-pretty",
                      styles.callout,
                    )}
                  >
                    {problem.response}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Bridge */}
      <section className="border-border border-t">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-20 lg:px-8">
          <p className="font-heading text-foreground text-2xl font-semibold text-balance sm:text-3xl">
            DishFrame is designed as a framework for planning a dish, cooking it
            clearly, learning from the result, and carrying what worked into the
            next cook.
          </p>
        </div>
      </section>

      {/* Detailed four-part framework */}
      <section className="border-border bg-surface-subtle border-t">
        <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-20 sm:px-6 lg:block lg:max-w-5xl lg:px-8">
          <h2 className="font-heading text-foreground text-2xl font-semibold sm:text-3xl">
            The framework underneath every dish.
          </h2>

          <div className="mt-14 flex flex-col gap-28">
            {STEPS.map(
              ({ title, accent, ring, icon: Icon, body, Visual }, index) => (
                <div
                  key={title}
                  className={cn(
                    "relative flex flex-col gap-8 lg:items-center lg:gap-16",
                    index % 2 === 1 ? "lg:flex-row-reverse" : "lg:flex-row",
                  )}
                >
                  <div className="flex-1">
                    <span
                      className={`inline-flex size-9 items-center justify-center rounded-full border-2 ${ring}`}
                      aria-hidden="true"
                    >
                      <Icon className={`size-4 ${accent}`} />
                    </span>
                    <p className="text-muted-foreground mt-3 text-xs font-semibold tracking-wide uppercase">
                      Step {index + 1}
                    </p>
                    <h3 className="font-heading text-foreground mt-1 text-xl font-semibold sm:text-2xl">
                      {title}
                    </h3>
                    <p className="text-muted-foreground mt-3 text-pretty lg:max-w-md">
                      {body}
                    </p>
                  </div>
                  <div className="flex flex-1 justify-center">
                    <Visual />
                  </div>
                  {index < STEPS.length - 1 && (
                    <AboutFrameworkThreadSegment
                      from={THREAD_ACCENTS[index]}
                      to={THREAD_ACCENTS[index + 1]}
                    />
                  )}
                </div>
              ),
            )}
          </div>
        </div>
      </section>

      <ClosingCta
        heading="Organize meals, cooking, and feedback."
        description="All so everything is easier and tastier next time."
      />
    </>
  );
}

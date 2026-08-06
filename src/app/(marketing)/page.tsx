import Link from "next/link";
import { ArrowRight, CalendarDays, History, Layers, Timer } from "lucide-react";
import { getServerSession } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { HeroVisual } from "@/components/marketing/hero-visual";
import { WorkflowPath } from "@/components/marketing/workflow-path";
import { JsonLd } from "@/components/marketing/json-ld";
import { ClosingCta } from "@/components/marketing/closing-cta";

const FRAMEWORK_STEPS = [
  { label: "Build", accent: "blue" as const },
  { label: "Plan", accent: "green" as const },
  { label: "Cook", accent: "orange" as const },
  { label: "Improve", accent: "purple" as const },
];

const TIMELINE = [
  {
    title: "Build it your way",
    accent: "text-primary",
    ring: "border-primary bg-primary/10",
    icon: Layers,
    body: "Organize your recipe by Sections to look only at what you need. Or turn them into Reusable Parts (i.e. White Rice) so if the recipe changes, it updates in every recipe that uses it.",
  },
  {
    title: "Plan the week ahead",
    accent: "text-brand-green",
    ring: "border-brand-green bg-brand-green/10",
    icon: CalendarDays,
    body: "Choose what you want to cook, place it into the week, and turn the plan into a Grocery List without rebuilding everything by hand.",
  },
  {
    title: "Cook without losing your place",
    accent: "text-brand-orange",
    ring: "border-brand-orange bg-brand-orange/10",
    icon: Timer,
    body: "Cooking Setup and Cooking Mode keep sections, checkoffs, and timers close at hand, so the information you need stays with the step you're on instead of buried in one long block of text.",
  },
  {
    title: "Improve it through use",
    accent: "text-brand-purple",
    ring: "border-brand-purple bg-brand-purple/10",
    icon: History,
    body: "Cooking Sessions capture notes, outcomes, and ratings. Save deliberate Versions when the Recipe itself changes, while keeping what worked available for next time.",
  },
];

export default async function MarketingHomePage() {
  const session = await getServerSession();
  const signedIn = Boolean(session);

  return (
    <>
      <JsonLd />

      {/* Hero */}
      <section className="mx-auto grid max-w-6xl gap-14 px-4 pt-16 pb-20 sm:px-6 sm:pt-20 sm:pb-28 lg:grid-cols-2 lg:items-center lg:gap-10 lg:px-8">
        <div className="flex flex-col items-start gap-6">
          <span className="text-primary text-sm font-semibold tracking-wide uppercase">
            Your personal cooking framework
          </span>
          <h1 className="font-heading text-foreground max-w-xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-[3.25rem]">
            Dishes that get better every time you cook.
          </h1>
          <p className="text-muted-foreground max-w-lg text-lg text-pretty">
            Build Recipes around the way you actually cook—plan the week,
            follow clear steps in the kitchen, reuse the Parts that repeat,
            and capture what to change next time.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button size="lg" asChild>
              {signedIn ? (
                <Link href="/home">
                  Open DishFrame
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              ) : (
                <Link href="/sign-in">
                  Create your first Recipe
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              )}
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="#framework">See how DishFrame works</Link>
            </Button>
          </div>
        </div>
        <HeroVisual />
      </section>

      {/* The four-part framework */}
      <section
        id="framework"
        className="border-border bg-surface-subtle border-t"
      >
        <div className="mx-auto max-w-5xl px-4 py-20 sm:px-6 lg:px-8">
          <h2 className="font-heading text-foreground text-2xl font-semibold sm:text-3xl">
            The framework underneath every dish.
          </h2>
          <WorkflowPath steps={FRAMEWORK_STEPS} className="mt-8" />

          <ol className="border-border mt-6 flex flex-col border-l">
            {TIMELINE.map(({ title, accent, ring, icon: Icon, body }, index) => (
              <li key={title} className="relative pb-12 pl-8 last:pb-0">
                <span
                  className={`absolute top-0 -left-[19px] flex size-9 items-center justify-center rounded-full border-2 ${ring}`}
                  aria-hidden="true"
                >
                  <Icon className={`size-4 ${accent}`} />
                </span>
                <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                  Step {index + 1}
                </p>
                <h3 className="font-heading text-foreground mt-1 text-xl font-semibold">
                  {title}
                </h3>
                <p className="text-muted-foreground mt-2 max-w-xl text-pretty">
                  {body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <ClosingCta
        heading="Make every meal better than the last."
        description="Build it clearly, plan it into the week, cook without losing your place, and keep what you learn for next time."
        signedIn={signedIn}
      />
    </>
  );
}

import { CalendarDays, History, Layers, Timer } from "lucide-react";
import { getServerSession } from "@/lib/auth/session";
import { HeroShowcase } from "@/components/marketing/hero-showcase";
import { WorkflowPath } from "@/components/marketing/workflow-path";
import { JsonLd } from "@/components/marketing/json-ld";
import { ClosingCta } from "@/components/marketing/closing-cta";

const FRAMEWORK_STEPS = [
  { label: "Build", accent: "blue" as const },
  { label: "Plan", accent: "green" as const },
  { label: "Cook", accent: "orange" as const },
  { label: "Improve", accent: "violet" as const },
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
    accent: "text-brand-violet",
    ring: "border-brand-violet bg-brand-violet/10",
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
      <HeroShowcase signedIn={signedIn} />

      {/* The four-part framework */}
      <section
        id="framework"
        className="border-border bg-surface-subtle flex flex-col items-center border-t"
      >
        <div className="mx-4 max-w-5xl px-4 py-20 sm:px-6 lg:px-8">
          <h2 className="font-heading text-foreground text-2xl font-semibold sm:text-3xl">
            The framework underneath every dish.
          </h2>
          <WorkflowPath steps={FRAMEWORK_STEPS} className="mt-8" />

          <ol className="border-border mt-6 flex flex-col border-l">
            {TIMELINE.map(
              ({ title, accent, ring, icon: Icon, body }, index) => (
                <li
                  key={title}
                  className="relative pr-4 pb-12 pl-8 last:pb-0 sm:pr-0"
                >
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
              ),
            )}
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

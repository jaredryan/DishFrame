"use client";

import {
  useId,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent,
} from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/branding/wordmark";
import { cn } from "@/lib/utils";
import { HeroCookingVisual } from "@/components/marketing/hero-cooking-visual";
import { HeroPartsVisual } from "@/components/marketing/hero-parts-visual";
import { HeroSessionsVisual } from "@/components/marketing/hero-sessions-visual";

type Accent = "green" | "orange" | "violet";

const ACCENTS: Record<
  Accent,
  { rule: string; heading: string; tabSelected: string; dot: string }
> = {
  green: {
    rule: "border-brand-green",
    heading: "text-brand-green-text",
    tabSelected: "border-brand-green bg-brand-green/10 text-brand-green-text",
    dot: "bg-brand-green",
  },
  orange: {
    rule: "border-brand-orange",
    heading: "text-brand-orange-text",
    tabSelected:
      "border-brand-orange bg-brand-orange/10 text-brand-orange-text",
    dot: "bg-brand-orange",
  },
  violet: {
    rule: "border-brand-violet",
    heading: "text-brand-violet-text",
    tabSelected:
      "border-brand-violet bg-brand-violet/10 text-brand-violet-text",
    dot: "bg-brand-violet",
  },
};

const STATES: {
  id: string;
  tabLabel: string;
  heading: string;
  description: string;
  accent: Accent;
  visualLabel: string;
  Visual: ComponentType<{ className?: string }>;
}[] = [
  {
    id: "cooking-mode",
    tabLabel: "Stay focused",
    heading: "Stay focused in the kitchen.",
    description:
      "Cooking Mode keeps the current step, timers, and checkoffs close at hand.",
    accent: "orange",
    visualLabel:
      "Cooking Mode showing the Sauce section complete, Chicken as the current section with a running timer, and Rice waiting next, with step progress shown.",
    Visual: HeroCookingVisual,
  },
  {
    id: "reusable-parts",
    tabLabel: "Update once",
    heading: "Update it once.",
    description:
      "Improve a shared Part once, and every recipe that uses it stays current.",
    accent: "green",
    visualLabel:
      "A shared White Rice part connected to three recipes, with the update applied to all three.",
    Visual: HeroPartsVisual,
  },
  {
    id: "cooking-sessions",
    tabLabel: "Keep learning",
    heading: "Learn from every cooking session.",
    description:
      "Save notes, ratings, and meaningful changes while the details are still fresh.",
    accent: "violet",
    visualLabel:
      "A completed cooking session with a note and a rating, leading to a new recipe Version.",
    Visual: HeroSessionsVisual,
  },
];

const PANEL_TRANSITION =
  "[grid-area:1/1] transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none motion-reduce:transform-none";

export function HeroShowcase() {
  const [activeIndex, setActiveIndex] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const baseId = useId();

  function focusTab(index: number) {
    const wrapped = (index + STATES.length) % STATES.length;
    setActiveIndex(wrapped);
    tabRefs.current[wrapped]?.focus();
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        focusTab(index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        focusTab(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusTab(0);
        break;
      case "End":
        event.preventDefault();
        focusTab(STATES.length - 1);
        break;
    }
  }

  const active = STATES[activeIndex];

  return (
    <section className="mx-auto grid max-w-6xl gap-8 px-4 pt-16 pb-20 sm:px-6 sm:pt-20 sm:pb-28 lg:grid-cols-2 lg:items-center lg:gap-x-10 lg:gap-y-6 lg:px-8 [&>*]:min-w-0">
      <div className="flex min-w-0 flex-col items-center gap-5 lg:col-start-1 lg:row-start-1 lg:items-start">
        <Wordmark
          href={null}
          className="gap-3 text-3xl font-medium sm:text-4xl lg:text-[2.75rem]"
          iconClassName="size-9 sm:size-11 lg:size-12"
        />
        <h1 className="font-heading text-foreground max-w-lg text-3xl font-semibold tracking-tight text-balance sm:text-4xl lg:max-w-xl lg:text-5xl">
          A better framework for the dishes you cook.
        </h1>

        <div
          role="tabpanel"
          id={`${baseId}-panel`}
          aria-labelledby={`${baseId}-tab-${activeIndex}`}
          tabIndex={0}
          className="relative grid w-full max-w-lg min-w-0"
        >
          {STATES.map((state, index) => {
            const isActive = index === activeIndex;
            const accent = ACCENTS[state.accent];
            return (
              <div
                key={state.id}
                aria-hidden={!isActive}
                className={cn(
                  PANEL_TRANSITION,
                  "min-w-0 border-l-2 pl-4",
                  accent.rule,
                  isActive
                    ? "translate-y-0 opacity-100"
                    : "pointer-events-none translate-y-1 opacity-0",
                )}
              >
                <p
                  className={cn(
                    "font-heading text-lg font-semibold sm:text-xl",
                    accent.heading,
                  )}
                >
                  {state.heading}
                </p>
                <p className="text-muted-foreground mt-1.5 max-w-md text-sm text-pretty sm:text-base">
                  {state.description}
                </p>
              </div>
            );
          })}
        </div>

        <div
          role="tablist"
          aria-label="Hero feature"
          aria-orientation="horizontal"
          className="grid w-full max-w-lg min-w-0 grid-cols-3 gap-1.5 sm:gap-2"
        >
          {STATES.map((state, index) => {
            const isActive = index === activeIndex;
            const accent = ACCENTS[state.accent];
            return (
              <button
                key={state.id}
                ref={(el) => {
                  tabRefs.current[index] = el;
                }}
                type="button"
                role="tab"
                id={`${baseId}-tab-${index}`}
                aria-selected={isActive}
                aria-controls={`${baseId}-panel`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActiveIndex(index)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                className={cn(
                  "focus-visible:border-ring focus-visible:ring-ring/50 flex min-h-11 min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-center text-xs font-medium transition-colors outline-none focus-visible:ring-3 sm:text-sm",
                  isActive
                    ? cn("font-semibold", accent.tabSelected)
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    isActive ? accent.dot : "bg-border",
                  )}
                />
                {state.tabLabel}
              </button>
            );
          })}
        </div>
      </div>

      <div
        role="img"
        aria-label={active.visualLabel}
        className="relative mx-auto grid aspect-4/3 w-full max-w-md min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1"
      >
        {STATES.map((state, index) => {
          const isActive = index === activeIndex;
          const Visual = state.Visual;
          return (
            <div
              key={state.id}
              className={cn(
                PANEL_TRANSITION,
                isActive
                  ? "translate-y-0 opacity-100"
                  : "pointer-events-none translate-y-1 opacity-0",
              )}
            >
              <Visual />
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-col justify-center gap-3 sm:flex-row lg:col-start-1 lg:row-start-2 lg:mt-0 lg:justify-start">
        <Button size="lg" asChild>
          <Link href="/home">
            Create your first recipe
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
        <Button size="lg" variant="outline" asChild>
          <Link href="#framework">See how DishFrame works</Link>
        </Button>
      </div>
    </section>
  );
}

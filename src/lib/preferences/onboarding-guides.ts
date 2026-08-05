// PRODUCT_SPEC.md §92.5 / §93.1 — the distinct guides DishFrame remembers
// completed/dismissed/incomplete progress for, keyed independently so
// completing one never affects another.
export const ONBOARDING_GUIDE_KEYS = [
  "intro",
  "recipe-sections-stage",
  "editor-versions",
  "parts-intro",
  "cooking-session",
  "session-review",
  "meal-plans-intro",
  "grocery-lists-intro",
  "sharing-intro",
  "tasters-intro",
] as const;

export type OnboardingGuideKey = (typeof ONBOARDING_GUIDE_KEYS)[number];

export const ONBOARDING_GUIDE_STATUSES = ["completed", "dismissed"] as const;

export type OnboardingGuideStatus = (typeof ONBOARDING_GUIDE_STATUSES)[number];

// A guide key absent from this map is "incomplete" (§92.5) — never
// persisted as an explicit value, just the absence of one.
export type OnboardingState = Partial<
  Record<OnboardingGuideKey, OnboardingGuideStatus>
>;

// Help's "replayable interactive guides" list (§93.4) — one entry per guide
// key above, with where replaying it should navigate to.
export const ONBOARDING_GUIDE_INFO: Record<
  OnboardingGuideKey,
  { title: string; description: string; href: string }
> = {
  intro: {
    title: "Welcome introduction",
    description:
      "The Save → cook → evaluate → revise → reuse loop, Versions, and Parts.",
    href: "/home",
  },
  "recipe-sections-stage": {
    title: "Sections and Stage",
    description: "How a Recipe is broken into Sections, and what Stage tracks.",
    href: "/recipes/new",
  },
  "editor-versions": {
    title: "Versions",
    description: "Why saving an edit never overwrites an earlier attempt.",
    href: "/recipes",
  },
  "parts-intro": {
    title: "Reusable Parts",
    description:
      "Saving a preparation once and linking it into more than one Recipe.",
    href: "/parts",
  },
  "cooking-session": {
    title: "Cooking Sessions",
    description: "What happens while you're actively cooking a Recipe or Part.",
    href: "/cook",
  },
  "session-review": {
    title: "Session Reviews",
    description: "Recording what worked (and what didn't) after cooking.",
    href: "/cook",
  },
  "meal-plans-intro": {
    title: "Meal Plans",
    description:
      "Planning meals across a date range and generating a synced grocery list.",
    href: "/meal-plans",
  },
  "grocery-lists-intro": {
    title: "Grocery Lists",
    description:
      "Generating a shopping list from Recipes/Parts or a Meal Plan, with combined items.",
    href: "/grocery-lists",
  },
  "sharing-intro": {
    title: "Sharing",
    description:
      "The difference between a share link, sending directly to a user, and the independent copy each creates.",
    href: "/share",
  },
  "tasters-intro": {
    title: "Tasters",
    description: "Who Tasters are and how their ratings are remembered.",
    href: "/tasters",
  },
};

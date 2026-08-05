"use client";

import { Lightbulb, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOnboarding } from "@/components/onboarding/onboarding-provider";
import type { OnboardingGuideKey } from "@/lib/preferences/onboarding-guides";

/**
 * PRODUCT_SPEC.md §93.1 contextual teaching moment: a small, inline,
 * dismissible callout rather than a positioned tooltip pinned to a specific
 * control — cheaper to keep correct across the responsive layouts Slice 21
 * still owns, and never blocks ordinary use (§92 "without gating ordinary
 * use behind a mandatory tour"). Renders nothing once the guide is
 * completed or dismissed.
 */
export function CoachMark({
  guideKey,
  title,
  children,
  className,
}: {
  guideKey: OnboardingGuideKey;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { guideStatus, markGuide } = useOnboarding();

  if (guideStatus(guideKey) != null) {
    return null;
  }

  return (
    <div
      role="note"
      className={
        "border-brand-green/30 bg-brand-green/5 relative flex flex-col gap-1.5 rounded-xl border p-4 pr-10 text-sm" +
        (className ? ` ${className}` : "")
      }
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="absolute top-2 right-2"
        aria-label={`Dismiss: ${title}`}
        onClick={() => markGuide(guideKey, "dismissed")}
      >
        <X aria-hidden="true" />
      </Button>
      <div className="text-foreground flex items-center gap-2 font-semibold">
        <Lightbulb className="size-4 shrink-0" aria-hidden="true" />
        {title}
      </div>
      <div className="text-muted-foreground">{children}</div>
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-1"
          onClick={() => markGuide(guideKey, "completed")}
        >
          Got it
        </Button>
      </div>
    </div>
  );
}

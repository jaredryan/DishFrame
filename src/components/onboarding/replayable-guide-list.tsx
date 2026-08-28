"use client";

import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOnboarding } from "@/components/onboarding/onboarding-provider";
import {
  ONBOARDING_GUIDE_INFO,
  ONBOARDING_GUIDE_KEYS,
} from "@/lib/preferences/onboarding-guides";

/**
 * PRODUCT_SPEC.md §93.4: Help's "replayable interactive guides" — resets a
 * guide's status so its CoachMark (or the initial introduction) renders
 * again, then navigates to where it lives.
 */
export function ReplayableGuideList() {
  const router = useRouter();
  const { guideStatus, resetGuide } = useOnboarding();

  return (
    <ul className="flex flex-col gap-2">
      {ONBOARDING_GUIDE_KEYS.map((guideKey) => {
        const info = ONBOARDING_GUIDE_INFO[guideKey];
        const status = guideStatus(guideKey);
        return (
          <li key={guideKey}>
            <button
              type="button"
              onClick={() => {
                resetGuide(guideKey);
                router.push(info.href);
              }}
              aria-label={`Replay ${info.title} guide`}
              className="border-border bg-card hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-ring/50 flex w-full cursor-pointer flex-col gap-3 rounded-xl border p-4 text-left transition-colors outline-none focus-visible:ring-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-2.5">
                {status != null ? (
                  <CheckCircle2
                    className="text-brand-green mt-0.5 size-4 shrink-0"
                    aria-hidden="true"
                  />
                ) : (
                  <Circle
                    className="text-muted-foreground mt-0.5 size-4 shrink-0"
                    aria-hidden="true"
                  />
                )}
                <div>
                  <p className="text-foreground text-sm font-medium">
                    {info.title}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {info.description}
                  </p>
                </div>
              </div>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="pointer-events-none self-start sm:shrink-0 sm:self-auto"
              >
                <span>
                  <RotateCcw aria-hidden="true" />
                  Replay
                </span>
              </Button>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

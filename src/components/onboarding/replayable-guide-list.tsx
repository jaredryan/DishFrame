"use client";

import { useRouter } from "next/navigation";
import { Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useOnboarding } from "@/components/onboarding/onboarding-provider";
import {
  ONBOARDING_GUIDE_INFO,
  ONBOARDING_GUIDE_KEYS,
} from "@/lib/preferences/onboarding-guides";

// PRODUCT_SPEC.md §93.4. Informational cards, not entity rows — explicit
// controls only, no whole-card click. The checkbox lets a user mark/skip a
// guide as completed without playing it; Play/Replay always launches it.

export function ReplayableGuideList() {
  const router = useRouter();
  const { guideStatus, markGuide, resetGuide } = useOnboarding();

  return (
    <ul className="flex flex-col gap-2">
      {ONBOARDING_GUIDE_KEYS.map((guideKey) => {
        const info = ONBOARDING_GUIDE_INFO[guideKey];
        const completed = guideStatus(guideKey) != null;
        return (
          <li
            key={guideKey}
            className="border-border bg-card flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-2.5">
              <Checkbox
                checked={completed}
                onCheckedChange={(checked) => {
                  if (checked === true) {
                    markGuide(guideKey, "completed");
                  } else {
                    resetGuide(guideKey);
                  }
                }}
                aria-label={`${info.title} guide completed`}
                className="mt-0.5"
              />
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
              type="button"
              variant="outline"
              size="sm"
              className="self-start sm:shrink-0 sm:self-auto"
              aria-label={`${completed ? "Replay" : "Play"} ${info.title} guide`}
              onClick={() => {
                resetGuide(guideKey);
                router.push(info.href);
              }}
            >
              {completed ? (
                <>
                  <RotateCcw aria-hidden="true" />
                  Replay
                </>
              ) : (
                <>
                  <Play aria-hidden="true" />
                  Play
                </>
              )}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

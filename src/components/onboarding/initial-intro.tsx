"use client";

import * as React from "react";
import { Layers, RefreshCw, Utensils } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ExampleRecipeDemo } from "@/components/onboarding/example-recipe-demo";
import { useOnboarding } from "@/components/onboarding/onboarding-provider";
import { updatePreferences } from "@/lib/preferences/actions";
import type { PreferencesFormValues } from "@/lib/preferences/schema";

const LOOP_STEPS = [
  { icon: Utensils, label: "Save a recipe" },
  { icon: Utensils, label: "Cook it" },
  { icon: RefreshCw, label: "Evaluate & revise" },
  { icon: Layers, label: "Reuse the parts that work" },
];

/**
 * PRODUCT_SPEC.md §92.2–§92.3: a brief, skippable two-step introduction —
 * concepts + a live example first, then an optional compact preference
 * step. Neither step is a wizard blocking ordinary use (§8.1's "do not use
 * a multi-step onboarding flow" governs Recipe creation specifically, not
 * this standalone, always-skippable overlay). Rendered once per account
 * until the "intro" guide is completed or dismissed (§92.5).
 */
export function InitialIntro({
  initialPreferences,
}: {
  initialPreferences: PreferencesFormValues;
}) {
  const { guideStatus, markGuide } = useOnboarding();
  const [step, setStep] = React.useState<0 | 1>(0);
  const [preferences, setPreferences] =
    React.useState<PreferencesFormValues>(initialPreferences);

  const open = guideStatus("intro") == null;

  function finish() {
    markGuide("intro", "completed");
  }

  function skip() {
    markGuide("intro", "dismissed");
  }

  function save(next: PreferencesFormValues) {
    setPreferences(next);
    void updatePreferences(next);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && skip()}>
      <DialogContent className="sm:max-w-lg">
        {step === 0 ? (
          <>
            <DialogHeader>
              <DialogTitle>Welcome to DishFrame</DialogTitle>
              <DialogDescription>
                A framework for organizing, cooking, and improving the dishes
                you make.
              </DialogDescription>
            </DialogHeader>

            <ul className="grid grid-cols-2 gap-2 text-sm">
              {LOOP_STEPS.map(({ icon: Icon, label }) => (
                <li
                  key={label}
                  className="border-border bg-card flex items-center gap-2 rounded-lg border p-2.5"
                >
                  <Icon
                    className="text-brand-green size-4 shrink-0"
                    aria-hidden="true"
                  />
                  {label}
                </li>
              ))}
            </ul>

            <p className="text-muted-foreground text-sm">
              Every time you save a Recipe again, DishFrame keeps the earlier
              attempt as a <strong className="text-foreground">Version</strong>{" "}
              — nothing is overwritten. A{" "}
              <strong className="text-foreground">Part</strong> is a preparation
              — a sauce, a side, a staple — you save once and reuse across
              recipes instead of retyping it every time.
            </p>

            <ExampleRecipeDemo />

            <DialogFooter className="sm:justify-between">
              <Button type="button" variant="ghost" onClick={skip}>
                Skip
              </Button>
              <Button type="button" onClick={() => setStep(1)}>
                Next: quick preferences
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>A few quick preferences</DialogTitle>
              <DialogDescription>
                Editable any time later under Settings.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="intro-measurement-system">
                    Measurement system
                  </Label>
                  <Select
                    value={preferences.measurementSystem}
                    onValueChange={(value) =>
                      save({
                        ...preferences,
                        measurementSystem:
                          value as PreferencesFormValues["measurementSystem"],
                      })
                    }
                  >
                    <SelectTrigger
                      id="intro-measurement-system"
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="US">US customary</SelectItem>
                      <SelectItem value="METRIC">Metric</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="intro-fraction-or-decimal">Quantities</Label>
                  <Select
                    value={preferences.fractionOrDecimal}
                    onValueChange={(value) =>
                      save({
                        ...preferences,
                        fractionOrDecimal:
                          value as PreferencesFormValues["fractionOrDecimal"],
                      })
                    }
                  >
                    <SelectTrigger
                      id="intro-fraction-or-decimal"
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FRACTIONS">Fractions</SelectItem>
                      <SelectItem value="DECIMALS">Decimals</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="intro-timer-sound">Timer sound</Label>
                <Switch
                  id="intro-timer-sound"
                  checked={preferences.timerSoundEnabled}
                  onCheckedChange={(checked) =>
                    save({ ...preferences, timerSoundEnabled: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="intro-review-prompt">
                  Ask for a review after cooking
                </Label>
                <Switch
                  id="intro-review-prompt"
                  checked={preferences.reviewPromptEnabled}
                  onCheckedChange={(checked) =>
                    save({ ...preferences, reviewPromptEnabled: checked })
                  }
                />
              </div>
            </div>

            <DialogFooter className="sm:justify-between">
              <Button type="button" variant="ghost" onClick={() => setStep(0)}>
                Back
              </Button>
              <Button type="button" onClick={finish}>
                Done
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

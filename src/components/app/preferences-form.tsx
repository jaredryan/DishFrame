"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { updatePreferences } from "@/lib/preferences/actions";
import {
  initialPreferencesFormState,
  type PreferencesFormValues,
} from "@/lib/preferences/schema";

export function PreferencesForm({
  initialValues,
}: {
  initialValues: PreferencesFormValues;
}) {
  const [values, setValues] =
    React.useState<PreferencesFormValues>(initialValues);
  const { showToast } = useToast();
  // `updatePreferences` calls `revalidatePath("/settings")`, which bundles a
  // fresh render of this route into the same response the action returns.
  // A plain `useState` set from an awaited promise races that bundled
  // update and can be discarded before it ever paints — `useActionState`'s
  // returned state is instead applied as part of the same action-commit
  // React/Next already synchronize on, so it reliably survives it.
  const [, submitAction] = React.useActionState(
    async (
      _prevState: typeof initialPreferencesFormState,
      next: PreferencesFormValues,
    ) => {
      const result = await updatePreferences(next);
      const succeeded = result.status === "success";
      showToast({
        title:
          result.message ??
          (succeeded ? "Preferences saved." : "Could not save preferences."),
        variant: succeeded ? "success" : "error",
      });
      return result;
    },
    initialPreferencesFormState,
  );

  function save(next: PreferencesFormValues) {
    setValues(next);
    React.startTransition(() => submitAction(next));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="measurementSystem">Measurement system</Label>
          <Select
            value={values.measurementSystem}
            onValueChange={(value) =>
              save({
                ...values,
                measurementSystem:
                  value as PreferencesFormValues["measurementSystem"],
              })
            }
          >
            <SelectTrigger
              id="measurementSystem"
              className="w-full"
              aria-label="Measurement system"
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
          <Label htmlFor="fractionOrDecimal">Quantities</Label>
          <Select
            value={values.fractionOrDecimal}
            onValueChange={(value) =>
              save({
                ...values,
                fractionOrDecimal:
                  value as PreferencesFormValues["fractionOrDecimal"],
              })
            }
          >
            <SelectTrigger
              id="fractionOrDecimal"
              className="w-full"
              aria-label="Quantities"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="FRACTIONS">Fractions (1 1/2 cups)</SelectItem>
              <SelectItem value="DECIMALS">Decimals (1.5 cups)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="primaryRatingDisplay">Primary rating</Label>
          <Select
            value={values.primaryRatingDisplay}
            onValueChange={(value) =>
              save({
                ...values,
                primaryRatingDisplay:
                  value as PreferencesFormValues["primaryRatingDisplay"],
              })
            }
          >
            <SelectTrigger
              id="primaryRatingDisplay"
              className="w-full sm:w-64"
              aria-label="Primary rating"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="GROUP_AVERAGE">Group average</SelectItem>
              <SelectItem value="YOUR_RATING">Your rating</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <Label
            htmlFor="timerSoundEnabled"
            className="text-foreground text-sm leading-normal font-medium"
          >
            Timer sound
          </Label>
          <p className="text-muted-foreground text-sm">
            Play a short sound when a cooking timer finishes.
          </p>
        </div>
        <Switch
          id="timerSoundEnabled"
          checked={values.timerSoundEnabled}
          onCheckedChange={(checked) =>
            save({ ...values, timerSoundEnabled: checked })
          }
          aria-label="Timer sound"
        />
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <Label
            htmlFor="reviewPromptEnabled"
            className="text-foreground text-sm leading-normal font-medium"
          >
            Review prompt
          </Label>
          <p className="text-muted-foreground text-sm">
            Ask &ldquo;Want to record how it went?&rdquo; after cooking.
          </p>
        </div>
        <Switch
          id="reviewPromptEnabled"
          checked={values.reviewPromptEnabled}
          onCheckedChange={(checked) =>
            save({ ...values, reviewPromptEnabled: checked })
          }
          aria-label="Review prompt"
        />
      </div>
    </div>
  );
}

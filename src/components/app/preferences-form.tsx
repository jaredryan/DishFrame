"use client";

import * as React from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const [state, setState] = React.useState(initialPreferencesFormState);
  const [isPending, startTransition] = React.useTransition();

  function save(next: PreferencesFormValues) {
    setValues(next);
    startTransition(async () => {
      const result = await updatePreferences(next);
      setState(result);
    });
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
            <SelectTrigger id="measurementSystem" className="w-full">
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
            <SelectTrigger id="fractionOrDecimal" className="w-full">
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
            <SelectTrigger id="primaryRatingDisplay" className="w-full sm:w-64">
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
          <Label htmlFor="timerSoundEnabled">Timer sound</Label>
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
        />
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="reviewPromptEnabled">Review prompt</Label>
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
        />
      </div>

      <div aria-live="polite" className="min-h-0 empty:hidden">
        {!isPending && state.status === "success" && (
          <p
            role="status"
            className="border-brand-green/30 bg-brand-green/10 text-brand-green-text flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
          >
            <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
            <span>{state.message}</span>
          </p>
        )}
        {!isPending && state.status === "error" && (
          <p
            role="alert"
            className="border-destructive/30 bg-destructive/10 text-destructive-text flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
          >
            <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
            <span>{state.message}</span>
          </p>
        )}
      </div>
    </div>
  );
}

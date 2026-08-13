import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTimer } from "@/lib/cooking/actions";

export function AddTimerForm({
  sessionId,
  unitId,
  onDone,
  onCancel,
}: {
  sessionId: string;
  unitId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = React.useState("Timer");
  const [minutes, setMinutes] = React.useState("10");
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const nameId = React.useId();
  const minutesId = React.useId();

  function handleCreate() {
    const parsedMinutes = Number(minutes);
    if (!Number.isFinite(parsedMinutes) || parsedMinutes <= 0) {
      setError("Enter a duration greater than zero.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createTimer({
        sessionId,
        unitId,
        name: name.trim() || "Timer",
        durationSeconds: Math.round(parsedMinutes * 60),
      });
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      onDone();
    });
  }

  return (
    <div className="border-border bg-muted/30 flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={nameId} className="text-xs font-normal">
            Name
          </Label>
          <Input
            id={nameId}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-32"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={minutesId} className="text-xs font-normal">
            Minutes
          </Label>
          <Input
            id={minutesId}
            inputMode="decimal"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            className="w-20"
          />
        </div>
        <Button onClick={handleCreate} disabled={isPending} size="sm">
          Start timer
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-destructive-text text-xs">
          {error}
        </p>
      )}
    </div>
  );
}

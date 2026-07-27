import * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Shared field primitives (final Gate 2 correction pass — see the
 * "reusable building blocks" audit in `docs/GATE_2_REMEDIATION.md`).
 *
 * Before this, top-level Recipe/Part metadata fields used the plain
 * `Label` component at its default size/weight, while every field nested
 * inside a Section/Ingredient/Instruction/Substitute overrode it with an
 * ad hoc `text-muted-foreground text-xs` className — two different label
 * typographies for what is, structurally, the same kind of thing. `Field`/
 * `FieldLabel`/`FieldDescription`/`FieldError` are now used by both, so
 * label typography, spacing, and error treatment are identical everywhere;
 * visual hierarchy between "this is top-level metadata" and "this is a
 * nested row field" comes from layout and container styling (card
 * backgrounds, spacing, grouping) instead, per the same principle
 * `BRANDING.md` §5.2 already applies to nesting generally.
 */
export function Field({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}

export function FieldLabel({
  className,
  ...props
}: React.ComponentProps<typeof Label>) {
  return <Label data-slot="field-label" className={cn(className)} {...props} />;
}

export function FieldDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="field-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

export function FieldError({
  className,
  children,
  ...props
}: React.ComponentProps<"p">) {
  if (!children) return null;
  return (
    <p
      role="alert"
      data-slot="field-error"
      className={cn("text-destructive text-sm", className)}
      {...props}
    >
      {children}
    </p>
  );
}

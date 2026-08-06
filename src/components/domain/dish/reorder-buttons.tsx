import {
  ChevronDown,
  ChevronUp,
  Pencil,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Slice 6A: every icon-only row action goes through the app's styled
// Tooltip, never a native `title` attribute.
export function TooltipIconButton({
  label,
  tooltip,
  onClick,
  icon: Icon,
  className,
  disabled,
}: {
  label: string;
  // Defaults to `label` — pass explicitly when the tooltip should say more
  // than the accessible name (e.g. "Copy to Section"'s aria-label vs. its
  // longer "Copy this Part into a Section" tooltip copy).
  tooltip?: string;
  onClick: () => void;
  icon: LucideIcon;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            className={className}
          >
            <Icon className="size-4" aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{tooltip ?? label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Consistent per-item toolbar (Gate 2 remediation, final correction pass;
// icons + styled Tooltip since Slice 6A) for Section/Ingredient rows: a
// local Collapse/Expand toggle and Remove. Reordering lives on a separate
// drag handle rendered by each row itself (`DragHandle`,
// src/components/ui/drag-handle.tsx). Instruction rows don't use this —
// they have no collapse state (Slice 6A) — see `InstructionFields`.
export function ItemToolbar({
  label,
  toggleLabel = label,
  collapsed,
  onToggleCollapsed,
  onRemove,
  variant = "chevron",
}: {
  label: string;
  // Slice 6A browser-review correction pass: the Collapse/Edit toggle's own
  // accessible label can differ from Remove's — a Section's numbered
  // fallback reads "Section 1" there but stays "section 1" for Remove.
  // Defaults to `label` for every other caller.
  toggleLabel?: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onRemove: () => void;
  // "edit": collapsed shows a pencil "Edit …" action (Sections only, per
  // this pass — a collapsed Section is edited, not merely revealed).
  // "chevron": collapsed shows a chevron-down "Expand …" action
  // (Ingredients, linked Parts — unaffected by this pass).
  variant?: "chevron" | "edit";
}) {
  const isEditVariant = variant === "edit";
  const collapsedIcon = isEditVariant ? Pencil : ChevronDown;
  const collapsedVerb = isEditVariant ? "Edit" : "Expand";
  return (
    <div className="flex items-center gap-0.5">
      <TooltipIconButton
        label={
          collapsed
            ? `${collapsedVerb} ${toggleLabel}`
            : `Collapse ${toggleLabel}`
        }
        icon={collapsed ? collapsedIcon : ChevronUp}
        onClick={onToggleCollapsed}
      />
      <TooltipIconButton
        label={`Remove ${label}`}
        icon={Trash2}
        onClick={onRemove}
        className="text-destructive-text hover:bg-destructive/10 hover:text-destructive-text"
      />
    </div>
  );
}

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// Consistent per-item toolbar (Gate 2 remediation, final correction pass)
// for Section/Ingredient/Instruction rows: a local Collapse/Edit toggle and
// Remove. Reordering now lives on a separate drag handle rendered by each
// row itself (`DragHandle`, `src/components/ui/drag-handle.tsx`) — no
// move-up/move-down buttons here anymore. Every control carries both an
// accessible name and a hover tooltip (`title`).
export function ItemToolbar({
  label,
  collapsed,
  onToggleCollapsed,
  onRemove,
}: {
  label: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-0.5">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onToggleCollapsed}
        aria-label={collapsed ? `Edit ${label}` : `Collapse ${label}`}
        title={collapsed ? `Edit ${label}` : `Collapse ${label}`}
      >
        {collapsed ? "Edit" : "Collapse"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        title={`Remove ${label}`}
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

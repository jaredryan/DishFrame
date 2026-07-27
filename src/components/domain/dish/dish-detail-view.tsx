import { Prisma } from "@/generated/prisma/client";
import Link from "next/link";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { StageBadge } from "@/components/domain/dish/stage-badge";
import { DishDetailActions } from "@/components/domain/dish/dish-detail-actions";
import { VersionSectionsView } from "@/components/domain/dish/version-sections-view";
import { VersionNoteEditor } from "@/components/domain/dish/version-note-editor";
import { dishBasePath } from "@/components/domain/dish/dish-card";
import type { DishKindValue } from "@/lib/dishes/schema";
import type { dishDetailInclude } from "@/lib/dishes/queries";
import { decimalToNumber } from "@/lib/dishes/format";

type DishDetail = Prisma.DishGetPayload<{ include: typeof dishDetailInclude }>;

function formatQuantity(value: Prisma.Decimal | null): string | null {
  const number = decimalToNumber(value);
  return number == null ? null : String(number);
}

export function DishDetailView({
  dish,
  kind,
}: {
  dish: DishDetail;
  kind: DishKindValue;
}) {
  const version = dish.currentVersion;
  const label = kind === "PART" ? "Part" : "Recipe";

  if (!version) {
    return (
      <p className="text-muted-foreground">
        This {label.toLowerCase()} has no saved content yet.
      </p>
    );
  }

  const versionLabel = `V${version.majorVersion}.${version.minorVersion}`;
  const collectionLabel = kind === "PART" ? "Parts" : "Recipes";

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: collectionLabel, href: dishBasePath(kind) },
          { label: version.title },
        ]}
      />
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-heading text-foreground text-2xl font-semibold">
            {version.title}
          </h1>
          <StageBadge stage={dish.stage} />
          <span className="text-muted-foreground text-xs tabular-nums">
            {versionLabel}
          </span>
        </div>
        {dish.cuisine && (
          <p className="text-muted-foreground text-sm">{dish.cuisine}</p>
        )}
        {version.description && <p>{version.description}</p>}

        <div className="text-muted-foreground flex flex-wrap gap-4 text-sm">
          {version.yieldQuantity && (
            <span>
              Makes {formatQuantity(version.yieldQuantity)}{" "}
              {version.yieldUnit ?? ""}
            </span>
          )}
          {version.prepTimeMinutes != null && (
            <span>Prep {version.prepTimeMinutes} min</span>
          )}
          {version.cookTimeMinutes != null && (
            <span>Cook {version.cookTimeMinutes} min</span>
          )}
          {version.difficulty && <span>{version.difficulty}</span>}
        </div>

        <DishDetailActions dishId={dish.id} kind={kind} stage={dish.stage} />

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Link
            href={`${dishBasePath(kind)}/${dish.id}/versions/${version.id}`}
            className="text-primary hover:underline"
          >
            Version history
          </Link>
          <Link
            href={`${dishBasePath(kind)}/${dish.id}/compare`}
            className="text-primary hover:underline"
          >
            Compare versions
          </Link>
        </div>

        <VersionNoteEditor
          key={version.id}
          kind={kind}
          dishId={dish.id}
          versionId={version.id}
          note={version.versionNote}
        />
      </div>

      <VersionSectionsView sections={version.sections} />
    </div>
  );
}

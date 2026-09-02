import { Badge } from "@/components/ui/badge";
import { SemanticChip } from "@/components/domain/dish/semantic-chip";
import { formatIngredientLine } from "@/lib/dishes/format";
import type {
  PublicShareContent,
  PublicSection,
  PublicPartLinkNode,
} from "@/lib/sharing/public-dto";
import { orderSectionsAndTopLevelPartLinks } from "@/lib/dishes/display-order";

function IngredientLine({
  ingredient,
}: {
  ingredient: Parameters<typeof formatIngredientLine>[0] & {
    isOptional: boolean;
    substitute: Parameters<typeof formatIngredientLine>[0] | null;
  };
}) {
  return (
    <li className="text-sm">
      {formatIngredientLine(ingredient)}
      {ingredient.isOptional && (
        <span className="text-muted-foreground"> (optional)</span>
      )}
      {ingredient.substitute && (
        <span className="text-muted-foreground block pl-4 text-xs">
          Substitute: {formatIngredientLine(ingredient.substitute)}
        </span>
      )}
    </li>
  );
}

type ImageSrc = (imageAssetId: string) => string;

/**
 * Sections and top-level PartLinks share one interleaved persisted
 * `position` sequence (schema.prisma's `Section.position` comment) — this
 * merges the two back into that single order, the same
 * `orderSectionsAndTopLevelPartLinks` helper the app's own current-Version
 * detail page, Version History, and print views use, rather than always
 * rendering every Section before every top-level Part. Used both for the
 * root item's own top-level content and, recursively, for each linked
 * Part's own top-level content (`PartLinkBlock`, below) — a linked Part is
 * itself a Recipe/Part with the exact same ordering invariant among its
 * own Sections/PartLinks.
 */
function OrderedTopLevelContent({
  sections,
  partLinks,
  imageSrc,
}: {
  sections: PublicSection[];
  partLinks: PublicPartLinkNode[];
  imageSrc: ImageSrc;
}) {
  const items = orderSectionsAndTopLevelPartLinks(
    sections.map((section) => ({ position: section.position, value: section })),
    partLinks.map((link) => ({ position: link.position, value: link })),
  );
  return (
    <>
      {items.map((item, i) =>
        item.type === "section" ? (
          <SectionBlock
            key={`section-${i}`}
            section={item.section}
            imageSrc={imageSrc}
          />
        ) : (
          <PartLinkBlock
            key={`partLink-${i}`}
            link={item.partLink}
            imageSrc={imageSrc}
          />
        ),
      )}
    </>
  );
}

function SectionBlock({
  section,
  imageSrc,
}: {
  section: PublicSection;
  imageSrc: ImageSrc;
}) {
  return (
    <div className="space-y-2">
      {section.name && <h3 className="font-medium">{section.name}</h3>}
      {section.guidanceNote && (
        <p className="text-muted-foreground text-sm">{section.guidanceNote}</p>
      )}
      {section.ingredients.length > 0 && (
        <ul className="list-inside list-disc space-y-1">
          {section.ingredients.map((ingredient, i) => (
            <IngredientLine key={i} ingredient={ingredient} />
          ))}
        </ul>
      )}
      {section.instructions.length > 0 && (
        <ol className="list-inside list-decimal space-y-1">
          {section.instructions.map((instruction, i) => (
            <li key={i} className="text-sm">
              {instruction.text}
            </li>
          ))}
        </ol>
      )}
      {section.partLinks.map((link, i) => (
        <PartLinkBlock key={i} link={link} imageSrc={imageSrc} />
      ))}
    </div>
  );
}

function PartLinkBlock({
  link,
  imageSrc,
}: {
  link: PublicPartLinkNode;
  imageSrc: ImageSrc;
}) {
  return (
    <div className="border-border rounded-md border p-3">
      <p className="font-medium">
        {link.title}{" "}
        <span className="text-muted-foreground text-xs">
          {link.versionLabel}
          {link.multiplier !== 1 ? ` · ${link.multiplier}×` : ""}
        </span>
      </p>
      {link.imageAssetId && (
        // eslint-disable-next-line @next/next/no-img-element -- authorized route, not a static/optimizable asset
        <img
          src={imageSrc(link.imageAssetId)}
          alt=""
          className="mt-2 h-auto max-w-full rounded-md"
        />
      )}
      <div className="mt-2 space-y-3">
        <OrderedTopLevelContent
          sections={link.sections}
          partLinks={link.partLinks}
          imageSrc={imageSrc}
        />
      </div>
    </div>
  );
}

/**
 * Slice 17 correction: `imageSrc` is a caller-supplied URL builder rather
 * than a hardcoded `shareToken` query string, so this same renderer serves
 * both the public `ShareLink` page (token-authorized) and the authenticated
 * direct-share preview (`?directShareId=`-authorized,
 * `direct-share-preview.tsx`) without duplicating ~200 lines of markup.
 */
export function PublicShareView({
  content,
  mode,
  creatorName,
  imageSrc,
}: {
  content: PublicShareContent;
  mode: "FIXED_SNAPSHOT" | "CURRENT";
  creatorName: string | null;
  imageSrc: ImageSrc;
}) {
  return (
    <article className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="space-y-2">
        <Badge variant="outline">
          {mode === "FIXED_SNAPSHOT"
            ? "Fixed snapshot"
            : "Live · follows current version"}
        </Badge>
        <h1 className="font-heading text-3xl font-semibold">{content.title}</h1>
        <p className="text-muted-foreground text-sm">
          {content.versionLabel}
          {creatorName ? ` · Shared by ${creatorName}` : ""}
        </p>
        {content.imageAssetId && (
          // eslint-disable-next-line @next/next/no-img-element -- authorized route, not a static/optimizable asset
          <img
            src={imageSrc(content.imageAssetId)}
            alt=""
            className="h-auto max-w-full rounded-lg"
          />
        )}
        {content.description && <p>{content.description}</p>}
        <div className="flex flex-wrap items-center gap-1.5">
          {content.cuisines.map((cuisineName) => (
            <SemanticChip key={cuisineName} semantic="green">
              {cuisineName}
            </SemanticChip>
          ))}
          {content.flavorProfiles.map((flavor) => (
            <SemanticChip key={flavor} semantic="green">
              {flavor}
            </SemanticChip>
          ))}
          {content.tags.map((tag) => (
            <SemanticChip key={tag} semantic="neutral">
              {tag}
            </SemanticChip>
          ))}
          {content.aggregateRating != null && content.ratingCount != null && (
            <SemanticChip semantic="purple" className="tabular-nums">
              {content.aggregateRating.toFixed(1)}★ ({content.ratingCount})
            </SemanticChip>
          )}
          {content.yieldQuantity != null && (
            <SemanticChip semantic="orange">
              Makes {content.yieldQuantity} {content.yieldUnit ?? ""}
            </SemanticChip>
          )}
          {content.difficulty && (
            <SemanticChip semantic="orange">{content.difficulty}</SemanticChip>
          )}
          {content.prepTimeMinutes != null && (
            <Badge variant="outline">Prep {content.prepTimeMinutes} min</Badge>
          )}
          {content.cookTimeMinutes != null && (
            <Badge variant="outline">Cook {content.cookTimeMinutes} min</Badge>
          )}
        </div>
      </header>

      <div className="space-y-4">
        <OrderedTopLevelContent
          sections={content.sections}
          partLinks={content.topLevelPartLinks}
          imageSrc={imageSrc}
        />
      </div>

      {content.nutrition && (
        <div className="border-border space-y-1 border-t pt-4 text-sm">
          <h2 className="font-medium">Nutrition</h2>
          <p className="text-muted-foreground">
            {[
              content.nutrition.calories != null &&
                `${content.nutrition.calories} cal`,
              content.nutrition.protein != null &&
                `${content.nutrition.protein}g protein`,
              content.nutrition.carbs != null &&
                `${content.nutrition.carbs}g carbs`,
              content.nutrition.fat != null && `${content.nutrition.fat}g fat`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      )}
    </article>
  );
}

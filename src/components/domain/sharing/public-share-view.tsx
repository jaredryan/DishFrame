import { Badge } from "@/components/ui/badge";
import { formatIngredientLine } from "@/lib/dishes/format";
import type {
  PublicShareContent,
  PublicSection,
  PublicPartLinkNode,
} from "@/lib/sharing/public-dto";

/** Every image on a public share page — root or nested Part — goes through
 * the same authenticated image route, authorized by the share token rather
 * than a session (`/api/images/[assetId]`'s ShareLink-token branch). */
function shareImageSrc(imageAssetId: string, shareToken: string): string {
  return `/api/images/${imageAssetId}?shareToken=${encodeURIComponent(shareToken)}`;
}

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

function SectionBlock({
  section,
  shareToken,
}: {
  section: PublicSection;
  shareToken: string;
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
        <PartLinkBlock key={i} link={link} shareToken={shareToken} />
      ))}
    </div>
  );
}

function PartLinkBlock({
  link,
  shareToken,
}: {
  link: PublicPartLinkNode;
  shareToken: string;
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
        // eslint-disable-next-line @next/next/no-img-element -- private, authenticated route, not a static/optimizable asset
        <img
          src={shareImageSrc(link.imageAssetId, shareToken)}
          alt=""
          className="mt-2 h-auto max-w-full rounded-md"
        />
      )}
      <div className="mt-2 space-y-3">
        {link.sections.map((section, i) => (
          <SectionBlock key={i} section={section} shareToken={shareToken} />
        ))}
        {link.partLinks.map((nested, i) => (
          <PartLinkBlock key={i} link={nested} shareToken={shareToken} />
        ))}
      </div>
    </div>
  );
}

export function PublicShareView({
  content,
  mode,
  creatorName,
  shareToken,
}: {
  content: PublicShareContent;
  mode: "FIXED_SNAPSHOT" | "CURRENT";
  creatorName: string | null;
  shareToken: string;
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
          // eslint-disable-next-line @next/next/no-img-element -- private, authenticated route, not a static/optimizable asset
          <img
            src={shareImageSrc(content.imageAssetId, shareToken)}
            alt=""
            className="h-auto max-w-full rounded-lg"
          />
        )}
        {content.description && <p>{content.description}</p>}
        <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {content.cuisine && <span>{content.cuisine}</span>}
          {content.yieldQuantity != null && (
            <span>
              Makes {content.yieldQuantity} {content.yieldUnit ?? ""}
            </span>
          )}
          {content.prepTimeMinutes != null && (
            <span>Prep {content.prepTimeMinutes} min</span>
          )}
          {content.cookTimeMinutes != null && (
            <span>Cook {content.cookTimeMinutes} min</span>
          )}
          {content.difficulty && <span>{content.difficulty}</span>}
          {content.aggregateRating != null && content.ratingCount != null && (
            <span>
              {content.aggregateRating.toFixed(1)}★ ({content.ratingCount})
            </span>
          )}
        </div>
        {(content.tags.length > 0 || content.flavorProfiles.length > 0) && (
          <div className="flex flex-wrap gap-2">
            {content.tags.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
            {content.flavorProfiles.map((flavor) => (
              <Badge key={flavor} variant="secondary">
                {flavor}
              </Badge>
            ))}
          </div>
        )}
      </header>

      <div className="space-y-4">
        {content.sections.map((section, i) => (
          <SectionBlock key={i} section={section} shareToken={shareToken} />
        ))}
        {content.topLevelPartLinks.map((link, i) => (
          <PartLinkBlock key={i} link={link} shareToken={shareToken} />
        ))}
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

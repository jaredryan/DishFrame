import { formatIngredientLine } from "@/lib/dishes/format";
import type {
  PublicShareContent,
  PublicSection,
  PublicPartLinkNode,
} from "@/lib/sharing/public-dto";
import { orderSectionsAndTopLevelPartLinks } from "@/lib/dishes/display-order";

type ImageSrc = (imageAssetId: string) => string;

/**
 * Sections and top-level PartLinks share one interleaved persisted
 * `position` sequence (schema.prisma's `Section.position` comment) — this
 * merges the two back into that single order, the same
 * `orderSectionsAndTopLevelPartLinks` helper the app's own current-Version
 * detail page and Version History use, rather than always rendering every
 * Section before every top-level Part. Used both for the root item's own
 * top-level content and, recursively, for each linked Part's own top-level
 * content (`PartLinkBlock`, below) — a linked Part is itself a Recipe/Part
 * with the exact same ordering invariant among its own Sections/PartLinks.
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

/**
 * PRODUCT_SPEC.md §87: a purpose-built print/PDF presentation, not the
 * ordinary app shell under a print media query. Uses a literal light
 * palette throughout (never `bg-background`/`text-foreground`/theme CSS
 * variables) so the printed document stays ink-friendly regardless of
 * whichever app theme was active when Print was pressed. Reuses the Slice
 * 16 `PublicShareContent` DTO and `formatIngredientLine` — the same
 * privacy-safe shape and quantity formatting a public share already
 * renders through — for both owner and public print routes.
 */
function IngredientRow({
  ingredient,
}: {
  ingredient: PublicShareContent["sections"][number]["ingredients"][number];
}) {
  return (
    <li className="break-inside-avoid text-[11pt] leading-snug text-neutral-900">
      {formatIngredientLine(ingredient)}
      {ingredient.isOptional && (
        <span className="text-neutral-500"> (optional)</span>
      )}
      {ingredient.substitute && (
        <span className="block pl-4 text-[10pt] text-neutral-500">
          Substitute: {formatIngredientLine(ingredient.substitute)}
        </span>
      )}
    </li>
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
    // `space-y-2` block flow, not flex — flex containers commonly refuse to
    // fragment their children across printed pages (Chrome/Safari print
    // engines), which is what forced a whole Section onto the next page
    // instead of letting it split when it didn't fit.
    <section className="space-y-2">
      {section.name && (
        <h3 className="break-after-avoid text-[13pt] font-semibold text-neutral-900">
          {section.name}
        </h3>
      )}
      {section.guidanceNote && (
        <p className="text-[11pt] text-neutral-600">{section.guidanceNote}</p>
      )}
      {section.ingredients.length > 0 && (
        <ul className="list-inside list-disc space-y-1">
          {section.ingredients.map((ingredient, i) => (
            <IngredientRow key={i} ingredient={ingredient} />
          ))}
        </ul>
      )}
      {section.instructions.length > 0 && (
        <ol className="list-inside list-decimal space-y-1">
          {section.instructions.map((instruction, i) => (
            <li
              key={i}
              className="break-inside-avoid text-[11pt] leading-snug text-neutral-900"
            >
              {instruction.text}
            </li>
          ))}
        </ol>
      )}
      {section.partLinks.map((link, i) => (
        <PartLinkBlock key={i} link={link} imageSrc={imageSrc} />
      ))}
    </section>
  );
}

/**
 * A linked Part renders in its authored position with a bordered, labeled
 * box so it stays visually distinct from the root item's own Sections
 * (PRODUCT_SPEC.md §87 / Slice 18: "clear visual distinction between the
 * root item and nested reusable Parts") — recurses for nested Parts and
 * for MATERIALIZED occurrences (their content is already resolved into
 * this same shape by `buildPublicShareContent`).
 */
function PartLinkBlock({
  link,
  imageSrc,
}: {
  link: PublicPartLinkNode;
  imageSrc: ImageSrc;
}) {
  return (
    <div className="flex break-inside-avoid-page flex-col gap-2 rounded-md border border-neutral-300 p-3">
      <p className="break-after-avoid text-[9pt] font-medium tracking-wide text-neutral-500 uppercase">
        Part
      </p>
      <h4 className="break-after-avoid text-[12pt] font-semibold text-neutral-900">
        {link.title}{" "}
        <span className="text-[10pt] font-normal text-neutral-500">
          {link.versionLabel}
          {link.multiplier !== 1 ? ` · ${link.multiplier}×` : ""}
        </span>
      </h4>
      {link.description && (
        <p className="text-[10pt] text-neutral-600">{link.description}</p>
      )}
      {link.imageAssetId && (
        // eslint-disable-next-line @next/next/no-img-element -- authorized route, not a static/optimizable asset
        <img
          src={imageSrc(link.imageAssetId)}
          alt=""
          className="max-h-48 w-full max-w-full rounded-md object-cover"
        />
      )}
      <div className="flex flex-col gap-3">
        <OrderedTopLevelContent
          sections={link.sections}
          partLinks={link.partLinks}
          imageSrc={imageSrc}
        />
      </div>
    </div>
  );
}

export function PrintDocument({
  content,
  kindLabel,
  badgeLabel,
  creatorName,
  historicalNote,
  imageSrc,
}: {
  content: PublicShareContent;
  kindLabel: "Recipe" | "Part";
  /** e.g. "Fixed snapshot", "Live · follows current version" — public only. */
  badgeLabel?: string;
  creatorName?: string | null;
  /** Shown for a historical owner Version print, never for the current one. */
  historicalNote?: string;
  imageSrc: ImageSrc;
}) {
  // The reusable-Part badge/Version badge sit as compact tags right before
  // the title; badgeLabel/creatorName (public share only) stay a plain
  // eyebrow line alongside them — kept out of the badge row itself.
  const trailingMetaLine = [
    badgeLabel,
    creatorName ? `Shared by ${creatorName}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const factLine = [
    content.cuisines.length > 0 ? content.cuisines.join(", ") : null,
    content.yieldQuantity != null
      ? `Makes ${content.yieldQuantity} ${content.yieldUnit ?? ""}`.trim()
      : null,
    content.prepTimeMinutes != null
      ? `Prep ${content.prepTimeMinutes} min`
      : null,
    content.cookTimeMinutes != null
      ? `Cook ${content.cookTimeMinutes} min`
      : null,
    content.difficulty,
    content.aggregateRating != null && content.ratingCount != null
      ? `${content.aggregateRating.toFixed(1)}★ (${content.ratingCount})`
      : null,
  ].filter(Boolean);

  return (
    <article className="mx-auto max-w-3xl space-y-6 bg-white px-6 py-10 text-neutral-900 print:max-w-none print:px-0 print:py-0">
      <header className="space-y-2 border-b border-neutral-300 pb-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {kindLabel === "Part" && (
            <span className="rounded border border-neutral-300 px-1.5 py-0.5 text-[9pt] font-medium tracking-wide text-neutral-600 uppercase">
              Part
            </span>
          )}
          <span className="rounded border border-neutral-300 px-1.5 py-0.5 text-[9pt] font-medium tracking-wide text-neutral-600 uppercase">
            {content.versionLabel}
          </span>
          {trailingMetaLine && (
            <span className="text-[10pt] font-medium tracking-wide text-neutral-500 uppercase">
              {trailingMetaLine}
            </span>
          )}
        </div>
        <h1 className="break-after-avoid text-[22pt] font-semibold text-neutral-900">
          {content.title}
        </h1>
        {historicalNote && (
          <p className="text-[10pt] text-neutral-500 italic">
            {historicalNote}
          </p>
        )}
        {content.imageAssetId && (
          // eslint-disable-next-line @next/next/no-img-element -- authorized route, not a static/optimizable asset
          <img
            src={imageSrc(content.imageAssetId)}
            alt=""
            className="max-h-72 w-full max-w-full rounded-md object-cover"
          />
        )}
        {content.description && (
          <p className="text-[11pt] whitespace-pre-wrap text-neutral-700">
            {content.description}
          </p>
        )}
        {factLine.length > 0 && (
          <p className="text-[10.5pt] text-neutral-600">
            {factLine.join(" · ")}
          </p>
        )}
        {(content.tags.length > 0 || content.flavorProfiles.length > 0) && (
          <p className="text-[10pt] text-neutral-500">
            {[...content.tags, ...content.flavorProfiles].join(" · ")}
          </p>
        )}
      </header>

      <div className="space-y-5">
        <OrderedTopLevelContent
          sections={content.sections}
          partLinks={content.topLevelPartLinks}
          imageSrc={imageSrc}
        />
      </div>

      {content.nutrition && (
        <div className="break-inside-avoid border-t border-neutral-300 pt-4">
          <h2 className="break-after-avoid text-[12pt] font-semibold text-neutral-900">
            Nutrition
          </h2>
          <p className="text-[10.5pt] text-neutral-600">
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
            {content.nutrition.sourceName
              ? ` · Source: ${content.nutrition.sourceName}`
              : ""}
          </p>
        </div>
      )}
    </article>
  );
}

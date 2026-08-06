/**
 * Shared layout for Privacy Policy and Terms of Use — plain, highly
 * legible legal-document styling kept out of each page's own content so
 * the two documents read as one consistent pair.
 */
export function LegalLayout({
  title,
  effectiveDate,
  intro,
  children,
}: {
  title: string;
  effectiveDate: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <p className="text-muted-foreground text-sm font-medium">
        Effective {effectiveDate}
      </p>
      <h1 className="font-heading text-foreground mt-2 text-3xl font-semibold sm:text-4xl">
        {title}
      </h1>
      {intro && (
        <p className="text-muted-foreground mt-6 text-lg text-pretty">
          {intro}
        </p>
      )}
      <div className="border-border [&_h2]:font-heading [&_h2]:text-foreground [&_p]:text-muted-foreground [&_li]:text-muted-foreground [&_a]:text-foreground mt-12 flex flex-col gap-10 border-t pt-12 [&_a]:underline [&_a]:underline-offset-2 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_li]:leading-relaxed [&_p]:mt-3 [&_p]:leading-relaxed [&_p]:text-pretty [&_ul]:mt-3 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5">
        {children}
      </div>
    </div>
  );
}

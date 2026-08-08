import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClosingCtaDotPattern } from "@/components/marketing/closing-cta-dot-pattern";

export function ClosingCta({
  heading,
  description,
}: {
  heading: string;
  description: string;
}) {
  return (
    <section className="bg-primary text-primary-foreground relative overflow-hidden">
      <ClosingCtaDotPattern />
      <div className="relative z-10 mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-20 text-center sm:px-6 lg:px-8">
        <h2 className="font-heading max-w-xl text-3xl font-semibold text-balance">
          {heading}
        </h2>
        <p className="text-primary-foreground/95 max-w-lg text-pretty">
          {description}
        </p>
        <Button
          size="lg"
          asChild
          className="bg-primary-foreground text-primary hover:bg-primary-foreground/90"
        >
          <Link href="/home">
            Create your first recipe
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </section>
  );
}

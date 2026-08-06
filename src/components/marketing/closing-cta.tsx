import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ClosingCta({
  heading,
  description,
  signedIn,
}: {
  heading: string;
  description: string;
  signedIn: boolean;
}) {
  return (
    <section className="bg-primary text-primary-foreground">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-20 text-center sm:px-6 lg:px-8">
        <h2 className="font-heading max-w-xl text-3xl font-semibold text-balance">
          {heading}
        </h2>
        <p className="max-w-lg text-pretty text-primary-foreground/85">
          {description}
        </p>
        <Button
          size="lg"
          asChild
          className="bg-primary-foreground text-primary hover:bg-primary-foreground/90"
        >
          {signedIn ? (
            <Link href="/home">
              Open DishFrame
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          ) : (
            <Link href="/sign-in">
              Create your first Recipe
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          )}
        </Button>
      </div>
    </section>
  );
}

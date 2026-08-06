import type { Metadata } from "next";
import { ContactForm } from "@/components/marketing/contact-form";
import { ContactVisual } from "@/components/marketing/contact-visual";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Report a bug, share friction you ran into while cooking, or suggest an idea for DishFrame.",
  alternates: {
    canonical: "/contact",
  },
  openGraph: {
    url: "/contact",
    title: "Contact | DishFrame",
    description:
      "Report a bug, share friction you ran into while cooking, or suggest an idea for DishFrame.",
  },
};

export default function ContactPage() {
  return (
    <div className="mx-auto grid max-w-5xl gap-16 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1fr_auto] lg:items-start lg:gap-12 lg:px-8">
      <div className="max-w-xl">
        <h1 className="font-heading text-foreground text-3xl font-semibold sm:text-4xl">
          Help make DishFrame better.
        </h1>
        <p className="text-muted-foreground mt-4 text-pretty">
          Found a bug, ran into friction while cooking, or have an idea that
          would improve the experience? Send a note.
        </p>

        <ContactForm />
      </div>

      <div className="hidden justify-self-center pt-2 lg:block">
        <ContactVisual />
      </div>
    </div>
  );
}

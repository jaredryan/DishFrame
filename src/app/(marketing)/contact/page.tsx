import type { Metadata } from "next";
import { ContactForm } from "@/components/marketing/contact-form";

export const metadata: Metadata = {
  title: "Contact",
  description: "Share questions, ideas, or practical feedback about DishFrame.",
  alternates: {
    canonical: "/contact",
  },
  openGraph: {
    url: "/contact",
    title: "Contact | DishFrame",
    description:
      "Share questions, ideas, or practical feedback about DishFrame.",
  },
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <h1 className="font-heading text-foreground text-3xl font-semibold sm:text-4xl">
        Contact
      </h1>
      <p className="text-muted-foreground mt-4 text-pretty">
        Questions, ideas, or feedback about DishFrame? Send a note. The product
        is still taking shape, and practical feedback from real home cooks is
        especially useful.
      </p>

      <ContactForm />
    </div>
  );
}

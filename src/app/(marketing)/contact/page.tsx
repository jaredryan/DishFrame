import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const metadata: Metadata = {
  title: "Contact",
  description: "Send feedback about DishFrame.",
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

      <form
        className="mt-10 flex flex-col gap-5"
        aria-describedby="contact-form-note"
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" autoComplete="name" disabled />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            disabled
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="message">Message</Label>
          <Textarea id="message" name="message" rows={5} disabled />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button type="submit" disabled>
            Send message
          </Button>
          <p id="contact-form-note" className="text-muted-foreground text-sm">
            Message sending is coming soon — this form isn&apos;t connected yet.
          </p>
        </div>
      </form>
    </div>
  );
}

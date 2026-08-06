"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitContactForm } from "@/app/(marketing)/contact/actions";
import {
  CONTACT_HONEYPOT_FIELD,
  CONTACT_STARTED_AT_FIELD,
  initialContactFormState,
} from "@/lib/contact/schema";

export function ContactForm() {
  const [state, formAction, isPending] = useActionState(
    submitContactForm,
    initialContactFormState,
  );
  const formRef = React.useRef<HTMLFormElement>(null);
  const startedAtRef = React.useRef<HTMLInputElement>(null);

  // Recorded on mount (client-only), directly on the hidden input rather
  // than through state — the value is only read at submit time, not
  // rendered, so it doesn't need to trigger a re-render. Reading it via an
  // effect (instead of during render) matters because /contact is
  // statically prerendered: a render-time timestamp would be baked in at
  // build time, not when a visitor actually opened the page.
  React.useEffect(() => {
    if (startedAtRef.current) {
      startedAtRef.current.value = String(Date.now());
    }
  }, []);

  React.useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
    }
  }, [state.status]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="mt-5 flex flex-col gap-5"
    >
      {/* Honeypot: invisible to real visitors, often filled by bots. */}
      <div
        aria-hidden="true"
        className="pointer-events-none h-0 w-0 overflow-hidden opacity-0"
      >
        <Label htmlFor={CONTACT_HONEYPOT_FIELD}>Company</Label>
        <Input
          id={CONTACT_HONEYPOT_FIELD}
          name={CONTACT_HONEYPOT_FIELD}
          tabIndex={-1}
          autoComplete="off"
        />
      </div>
      <input
        ref={startedAtRef}
        type="hidden"
        name={CONTACT_STARTED_AT_FIELD}
        defaultValue=""
      />

      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          autoComplete="name"
          required
          minLength={2}
          maxLength={100}
          defaultValue={state.values?.name}
          aria-invalid={Boolean(state.fieldErrors?.name)}
          aria-describedby={state.fieldErrors?.name ? "name-error" : undefined}
          disabled={isPending}
        />
        {state.fieldErrors?.name && (
          <p id="name-error" className="text-destructive text-sm">
            {state.fieldErrors.name}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          defaultValue={state.values?.email}
          aria-invalid={Boolean(state.fieldErrors?.email)}
          aria-describedby={
            state.fieldErrors?.email ? "email-error" : undefined
          }
          disabled={isPending}
        />
        {state.fieldErrors?.email && (
          <p id="email-error" className="text-destructive text-sm">
            {state.fieldErrors.email}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="message">Message</Label>
        <Textarea
          id="message"
          name="message"
          rows={5}
          required
          minLength={10}
          maxLength={5000}
          defaultValue={state.values?.message}
          aria-invalid={Boolean(state.fieldErrors?.message)}
          aria-describedby={
            state.fieldErrors?.message ? "message-error" : undefined
          }
          disabled={isPending}
        />
        {state.fieldErrors?.message && (
          <p id="message-error" className="text-destructive text-sm">
            {state.fieldErrors.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Sending…" : "Send message"}
        </Button>
        <p className="text-muted-foreground text-sm">
          Replies go to the email address you provide.
        </p>
      </div>

      <p className="text-muted-foreground text-xs text-pretty">
        DishFrame uses the information you provide to respond to your
        message. Read the{" "}
        <Link href="/privacy" className="text-foreground underline underline-offset-2">
          Privacy Policy
        </Link>
        .
      </p>

      <div aria-live="polite" className="min-h-0">
        {state.status === "success" && (
          <p
            role="status"
            className="border-brand-green/30 bg-brand-green/10 text-brand-green flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm"
          >
            <CheckCircle2
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <span>{state.message}</span>
          </p>
        )}
        {state.status === "error" && (
          <p
            role="alert"
            className="border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm"
          >
            <AlertCircle
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <span>{state.message}</span>
          </p>
        )}
      </div>
    </form>
  );
}

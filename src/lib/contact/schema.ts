import { z } from "zod";

// Server-authoritative validation for the contact form. The browser may
// mirror these constraints for UX, but only this schema decides whether an
// email actually gets sent.
export const contactFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Enter your name.")
    .max(100, "Name is too long."),
  email: z
    .string()
    .trim()
    .min(1, "Enter your email.")
    .max(254, "Email is too long.")
    .pipe(z.email("Enter a valid email address.")),
  message: z
    .string()
    .trim()
    .min(10, "Message should be at least 10 characters.")
    .max(5000, "Message is too long."),
});

export type ContactFormValues = z.infer<typeof contactFormSchema>;

export const CONTACT_HONEYPOT_FIELD = "company";
export const CONTACT_STARTED_AT_FIELD = "startedAt";

/** Minimum realistic time to fill the form; faster submissions are treated as bots. */
export const CONTACT_MIN_SUBMIT_MS = 1500;

// Kept alongside the schema (rather than in the "use server" actions
// module) because a Server Action file may only export async functions.
export type ContactFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Partial<Record<"name" | "email" | "message", string>>;
  values?: { name: string; email: string; message: string };
};

export const initialContactFormState: ContactFormState = { status: "idle" };

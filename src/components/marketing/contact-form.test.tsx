import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ContactForm } from "@/components/marketing/contact-form";

vi.mock("@/app/(marketing)/contact/actions", () => ({
  submitContactForm: vi.fn(async () => ({ status: "idle" })),
}));

describe("ContactForm", () => {
  it("renders the name, email, and message fields", () => {
    render(<ContactForm />);

    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Message")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Send message" }),
    ).toBeInTheDocument();
  });

  it("keeps the honeypot field out of the accessible form", () => {
    render(<ContactForm />);

    // Real visitors (and assistive tech) should never encounter this
    // field; only bots that blindly fill every input in the DOM do.
    const honeypot = document.querySelector('input[name="company"]');
    expect(honeypot).not.toBeNull();
    expect(honeypot).toHaveAttribute("tabIndex", "-1");
    expect(honeypot?.closest('[aria-hidden="true"]')).not.toBeNull();

    // getByRole (unlike getByLabelText) excludes elements hidden via an
    // aria-hidden ancestor, so the honeypot must not surface this way.
    expect(
      screen.queryByRole("textbox", { name: "Company" }),
    ).not.toBeInTheDocument();
  });

  it("never imports the Resend SDK or reads RESEND_API_KEY directly", () => {
    const source = readFileSync(
      path.resolve(process.cwd(), "src/components/marketing/contact-form.tsx"),
      "utf-8",
    );

    expect(source).not.toMatch(/from ["']resend["']/);
    expect(source).not.toContain("RESEND_API_KEY");
    expect(source).not.toContain("@/lib/env/server");
  });
});

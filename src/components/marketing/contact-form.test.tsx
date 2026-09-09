import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { render as rtlRender, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContactForm } from "@/components/marketing/contact-form";
import { ToastProvider, Toaster } from "@/components/ui/toast";
import type { ContactFormState } from "@/lib/contact/schema";

const mockSubmitContactForm = vi.fn<
  (prevState: ContactFormState, formData: FormData) => Promise<ContactFormState>
>(async () => ({ status: "idle" }));
vi.mock("@/app/(marketing)/contact/actions", () => ({
  submitContactForm: (prevState: ContactFormState, formData: FormData) =>
    mockSubmitContactForm(prevState, formData),
}));

function render(ui: ReactElement) {
  return rtlRender(ui, {
    wrapper: ({ children }) => (
      <ToastProvider>
        {children}
        <Toaster />
      </ToastProvider>
    ),
  });
}

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

  async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(
      screen.getByLabelText("Message"),
      "Loving DishFrame so far!",
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));
  }

  it("shows a success toast (not an inline banner) after a successful submission", async () => {
    mockSubmitContactForm.mockResolvedValueOnce({
      status: "success",
      message: "Thanks for reaching out. Your message has been sent.",
    });
    const user = userEvent.setup();
    render(<ContactForm />);

    await fillAndSubmit(user);

    expect(
      await screen.findByText(
        "Thanks for reaching out. Your message has been sent.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows an error toast for a transient/server submission failure", async () => {
    mockSubmitContactForm.mockResolvedValueOnce({
      status: "error",
      message: "Your message could not be sent. Please try again.",
    });
    const user = userEvent.setup();
    render(<ContactForm />);

    await fillAndSubmit(user);

    expect(
      await screen.findByText(
        "Your message could not be sent. Please try again.",
      ),
    ).toBeInTheDocument();
  });

  it("does not toast field-level validation errors, only shows them inline", async () => {
    mockSubmitContactForm.mockResolvedValueOnce({
      status: "error",
      message: "Please fix the highlighted fields and try again.",
      fieldErrors: { email: "Enter a valid email address." },
    });
    const user = userEvent.setup();
    render(<ContactForm />);

    await fillAndSubmit(user);

    expect(
      await screen.findByText("Enter a valid email address."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Please fix the highlighted fields and try again."),
    ).not.toBeInTheDocument();
  });
});

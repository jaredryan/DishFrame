import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONTACT_HONEYPOT_FIELD,
  CONTACT_STARTED_AT_FIELD,
} from "@/lib/contact/schema";

const send = vi.fn();

vi.mock("resend", () => ({
  Resend: class MockResend {
    emails = { send };
  },
}));

vi.mock("@/lib/env/server", () => ({
  env: {
    RESEND_API_KEY: "re_test_key",
    CONTACT_FROM_EMAIL: "DishFrame <onboarding@resend.dev>",
    CONTACT_TO_EMAIL: "owner@example.com",
    NEXT_PUBLIC_APP_URL: "https://dish-frame.vercel.app",
  },
  isContactFormConfigured: true,
}));

const { submitContactForm } = await import("./actions");

function buildFormData(overrides: Record<string, string> = {}) {
  const data = new FormData();
  const fields = {
    name: "Jamie Rivera",
    email: "jamie@example.com",
    message: "This is a perfectly good message about DishFrame.",
    [CONTACT_HONEYPOT_FIELD]: "",
    [CONTACT_STARTED_AT_FIELD]: String(Date.now() - 5000),
    ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}

beforeEach(() => {
  send.mockReset();
});

describe("submitContactForm", () => {
  it("sends a notification on a valid submission", async () => {
    send.mockResolvedValueOnce({ data: { id: "email_123" }, error: null });

    const result = await submitContactForm({ status: "idle" }, buildFormData());

    expect(result.status).toBe("success");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("passes the visitor's email as replyTo, and the configured from/to", async () => {
    send.mockResolvedValueOnce({ data: { id: "email_123" }, error: null });

    await submitContactForm(
      { status: "idle" },
      buildFormData({ email: "visitor@example.com" }),
    );

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "DishFrame <onboarding@resend.dev>",
        to: "owner@example.com",
        replyTo: "visitor@example.com",
        subject: "New DishFrame message from Jamie Rivera",
      }),
      expect.anything(),
    );
  });

  it("never puts the visitor's email in the from field", async () => {
    send.mockResolvedValueOnce({ data: { id: "email_123" }, error: null });

    await submitContactForm(
      { status: "idle" },
      buildFormData({ email: "visitor@example.com" }),
    );

    const [payload] = send.mock.calls[0];
    expect(payload.from).not.toContain("visitor@example.com");
  });

  it("rejects a name that's too short and does not call Resend", async () => {
    const result = await submitContactForm(
      { status: "idle" },
      buildFormData({ name: "J" }),
    );

    expect(result.status).toBe("error");
    expect(result.fieldErrors?.name).toBeTruthy();
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects an invalid email and does not call Resend", async () => {
    const result = await submitContactForm(
      { status: "idle" },
      buildFormData({ email: "not-an-email" }),
    );

    expect(result.status).toBe("error");
    expect(result.fieldErrors?.email).toBeTruthy();
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects a message that's too short and does not call Resend", async () => {
    const result = await submitContactForm(
      { status: "idle" },
      buildFormData({ message: "short" }),
    );

    expect(result.status).toBe("error");
    expect(result.fieldErrors?.message).toBeTruthy();
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects an empty message and does not call Resend", async () => {
    const result = await submitContactForm(
      { status: "idle" },
      buildFormData({ message: "" }),
    );

    expect(result.status).toBe("error");
    expect(result.fieldErrors?.message).toBeTruthy();
    expect(send).not.toHaveBeenCalled();
  });

  it("preserves entered values in the returned state after a validation error", async () => {
    const result = await submitContactForm(
      { status: "idle" },
      buildFormData({ name: "J" }),
    );

    expect(result.values).toEqual(
      expect.objectContaining({ email: "jamie@example.com" }),
    );
  });

  it("silently reports success without sending when the honeypot is filled", async () => {
    const result = await submitContactForm(
      { status: "idle" },
      buildFormData({ [CONTACT_HONEYPOT_FIELD]: "http://spam.example" }),
    );

    expect(result.status).toBe("success");
    expect(send).not.toHaveBeenCalled();
  });

  it("silently reports success without sending when submitted faster than humanly possible", async () => {
    const result = await submitContactForm(
      { status: "idle" },
      buildFormData({ [CONTACT_STARTED_AT_FIELD]: String(Date.now()) }),
    );

    expect(result.status).toBe("success");
    expect(send).not.toHaveBeenCalled();
  });

  it("returns an error and no false success when Resend rejects the send", async () => {
    send.mockResolvedValueOnce({
      data: null,
      error: {
        name: "validation_error",
        message: "bad request",
        statusCode: 422,
      },
    });

    const result = await submitContactForm({ status: "idle" }, buildFormData());

    expect(result.status).toBe("error");
    expect(result.message).not.toBe(
      "Thanks for reaching out. Your message has been sent.",
    );
  });

  it("returns an error and no false success when the Resend call throws", async () => {
    send.mockRejectedValueOnce(new Error("network down"));

    const result = await submitContactForm({ status: "idle" }, buildFormData());

    expect(result.status).toBe("error");
  });
});

describe("submitContactForm when Resend isn't configured", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/env/server");
  });

  it("fails clearly instead of attempting to send", async () => {
    vi.resetModules();
    vi.doMock("@/lib/env/server", () => ({
      env: {
        RESEND_API_KEY: undefined,
        CONTACT_FROM_EMAIL: "DishFrame <onboarding@resend.dev>",
        CONTACT_TO_EMAIL: undefined,
        NEXT_PUBLIC_APP_URL: "https://dish-frame.vercel.app",
      },
      isContactFormConfigured: false,
    }));

    const { submitContactForm: submitWithoutConfig } =
      await import("./actions");

    const result = await submitWithoutConfig(
      { status: "idle" },
      buildFormData(),
    );

    expect(result.status).toBe("error");
    expect(send).not.toHaveBeenCalled();
  });
});

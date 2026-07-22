import type { ContactFormValues } from "@/lib/contact/schema";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildContactSubject(name: string): string {
  return `New DishFrame message from ${name}`;
}

/**
 * Builds the notification email sent to CONTACT_TO_EMAIL. All visitor
 * content is HTML-escaped before interpolation — never render it as raw
 * markup.
 */
export function renderContactNotification(
  values: ContactFormValues & { submittedAt: Date; appUrl: string },
): { html: string; text: string } {
  const { name, email, message, submittedAt, appUrl } = values;
  const timestamp = submittedAt.toUTCString();

  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeMessageHtml = escapeHtml(message).replace(/\n/g, "<br />");

  const html = `<!DOCTYPE html>
<html lang="en">
  <body style="font-family: -apple-system, Helvetica, Arial, sans-serif; color: #252932; background-color: #f4f6f8; padding: 24px;">
    <table role="presentation" width="100%" style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #dfe4ea; padding: 24px;">
      <tr>
        <td>
          <h1 style="font-size: 18px; margin: 0 0 16px;">New DishFrame contact message</h1>
          <p style="margin: 0 0 4px;"><strong>Name:</strong> ${safeName}</p>
          <p style="margin: 0 0 4px;"><strong>Email:</strong> ${safeEmail}</p>
          <p style="margin: 0 0 16px; color: #667080; font-size: 13px;">Submitted ${escapeHtml(timestamp)} · ${escapeHtml(appUrl)}</p>
          <p style="margin: 0 0 8px;"><strong>Message:</strong></p>
          <p style="margin: 0; white-space: pre-wrap;">${safeMessageHtml}</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    "New DishFrame contact message",
    "",
    `Name: ${name}`,
    `Email: ${email}`,
    `Submitted: ${timestamp}`,
    `Source: DishFrame (${appUrl})`,
    "",
    "Message:",
    message,
  ].join("\n");

  return { html, text };
}

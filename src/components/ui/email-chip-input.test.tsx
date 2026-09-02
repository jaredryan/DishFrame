import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { EmailChipInput } from "@/components/ui/email-chip-input";

function ControlledInput({ initial = [] as string[] }) {
  const [emails, setEmails] = React.useState<string[]>(initial);
  return (
    <EmailChipInput
      id="recipients"
      value={emails}
      onChangeAction={setEmails}
      ariaLabel="Recipients"
    />
  );
}

describe("EmailChipInput", () => {
  it("commits a typed address to a chip on Enter and dedupes case-insensitively", async () => {
    const user = userEvent.setup();
    render(<ControlledInput />);
    const input = screen.getByLabelText("Recipients");

    await user.type(input, "Friend@Example.invalid{Enter}");
    expect(screen.getByText("friend@example.invalid")).toBeInTheDocument();

    await user.type(input, "friend@example.invalid,");
    expect(screen.getAllByText("friend@example.invalid")).toHaveLength(1);
  });

  it("also commits on comma and on blur", async () => {
    const user = userEvent.setup();
    render(<ControlledInput />);
    const input = screen.getByLabelText("Recipients");

    await user.type(input, "a@example.invalid,");
    expect(screen.getByText("a@example.invalid")).toBeInTheDocument();

    await user.type(input, "b@example.invalid");
    await user.tab();
    expect(screen.getByText("b@example.invalid")).toBeInTheDocument();
  });

  it("shows an inline error for an implausible address instead of creating a chip", async () => {
    const user = userEvent.setup();
    render(<ControlledInput />);
    const input = screen.getByLabelText("Recipients");

    await user.type(input, "not-an-email{Enter}");
    expect(
      screen.getByText('"not-an-email" isn\'t a valid email address.'),
    ).toBeInTheDocument();
    expect(screen.queryByText("not-an-email")).not.toBeInTheDocument();
  });

  it("removes a chip via its own remove control", async () => {
    const user = userEvent.setup();
    render(<ControlledInput initial={["a@example.invalid"]} />);

    expect(screen.getByText("a@example.invalid")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Remove a@example.invalid" }),
    );
    expect(screen.queryByText("a@example.invalid")).not.toBeInTheDocument();
  });

  it("Backspace on an empty field removes the last chip", async () => {
    const user = userEvent.setup();
    render(
      <ControlledInput initial={["a@example.invalid", "b@example.invalid"]} />,
    );
    const input = screen.getByLabelText("Recipients");

    await user.click(input);
    await user.keyboard("{Backspace}");

    expect(screen.getByText("a@example.invalid")).toBeInTheDocument();
    expect(screen.queryByText("b@example.invalid")).not.toBeInTheDocument();
  });

  it("splits a pasted comma-separated list into multiple chips", async () => {
    const user = userEvent.setup();
    render(<ControlledInput />);
    const input = screen.getByLabelText("Recipients");
    input.focus();
    await user.paste("a@example.invalid, b@example.invalid");

    expect(screen.getByText("a@example.invalid")).toBeInTheDocument();
    expect(screen.getByText("b@example.invalid")).toBeInTheDocument();
  });
});

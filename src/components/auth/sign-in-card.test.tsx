import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SignInCard } from "@/components/auth/sign-in-card";

const socialSignIn = vi.fn();

vi.mock("@/lib/auth/client", () => ({
  signIn: {
    social: (...args: unknown[]) => socialSignIn(...args),
  },
}));

describe("SignInCard", () => {
  it("shows the Google sign-in action and reassurance copy", () => {
    render(<SignInCard googleConfigured />);

    expect(
      screen.getByRole("button", { name: /continue with google/i }),
    ).toBeEnabled();
    expect(
      screen.getByText(
        "Your recipes stay private unless you choose to share them.",
      ),
    ).toBeInTheDocument();
  });

  it("disables sign-in and shows a setup notice when Google isn't configured", () => {
    render(<SignInCard googleConfigured={false} />);

    expect(
      screen.getByRole("button", { name: /continue with google/i }),
    ).toBeDisabled();
    expect(
      screen.getByText(/Google sign-in isn.t configured yet/),
    ).toBeInTheDocument();
  });

  it("calls the Google sign-in flow with a callback to /home", async () => {
    socialSignIn.mockResolvedValueOnce({ data: {}, error: null });
    const user = userEvent.setup();
    render(<SignInCard googleConfigured />);

    await user.click(
      screen.getByRole("button", { name: /continue with google/i }),
    );

    expect(socialSignIn).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "google", callbackURL: "/home" }),
    );
  });

  it("shows a friendly error when sign-in fails", async () => {
    socialSignIn.mockResolvedValueOnce({
      data: null,
      error: { message: "Something went wrong." },
    });
    const user = userEvent.setup();
    render(<SignInCard googleConfigured />);

    await user.click(
      screen.getByRole("button", { name: /continue with google/i }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong.",
    );
  });

  it("shows an error passed in from the server", () => {
    render(
      <SignInCard googleConfigured initialError="Sign-in was cancelled." />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Sign-in was cancelled.",
    );
  });
});

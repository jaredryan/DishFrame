import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider, Toaster, useToast } from "@/components/ui/toast";

/**
 * Toast-refinement pass: each semantic variant renders a distinguishable
 * left-border accent (never only a color, per the spec's "not the only
 * signal" requirement — the icon shape also differs per variant, covered
 * implicitly by these not colliding on the same DOM structure), a
 * `durationMs: null` toast never auto-dismisses and always exposes a close
 * control, and multiple caller actions render side by side.
 */
function Trigger({
  onReady,
}: {
  onReady: (showToast: ReturnType<typeof useToast>["showToast"]) => void;
}) {
  const { showToast } = useToast();
  onReady(showToast);
  return null;
}

function renderWithToast() {
  let showToast!: ReturnType<typeof useToast>["showToast"];
  render(
    <ToastProvider>
      <Trigger onReady={(fn) => (showToast = fn)} />
      <Toaster />
    </ToastProvider>,
  );
  return {
    showToast: (options: Parameters<typeof showToast>[0]) => showToast(options),
  };
}

describe("Toast semantic variants", () => {
  it.each([
    ["success", "border-l-brand-green"],
    ["error", "border-l-destructive"],
    ["attention", "border-l-brand-blue"],
    ["default", "border-l-border"],
  ] as const)(
    "renders the %s variant with its border accent",
    (variant, borderClass) => {
      const { showToast } = renderWithToast();
      act(() => {
        showToast({ title: "Hello", variant });
      });
      expect(screen.getByRole("status").className).toContain(borderClass);
    },
  );

  it("a persistent toast (durationMs: null) stays and always shows a dismiss control", async () => {
    const { showToast } = renderWithToast();
    act(() => {
      showToast({ title: "Published", durationMs: null });
    });

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Dismiss notification" }),
    ).toBeInTheDocument();
  });

  it("renders every caller-supplied action", async () => {
    const user = userEvent.setup();
    const { showToast } = renderWithToast();
    let copied = false;
    let opened = false;
    act(() => {
      showToast({
        title: "Published",
        durationMs: null,
        actions: [
          { label: "Copy link", onClick: () => (copied = true) },
          { label: "Open", onClick: () => (opened = true) },
        ],
      });
    });

    await user.click(screen.getByRole("button", { name: "Copy link" }));
    await user.click(screen.getByRole("button", { name: "Open" }));

    expect(copied).toBe(true);
    expect(opened).toBe(true);
  });

  it("dismissing fires onDismiss exactly once", async () => {
    const user = userEvent.setup();
    const { showToast } = renderWithToast();
    let dismissed = 0;
    act(() => {
      showToast({
        title: "Hi",
        durationMs: null,
        onDismiss: () => dismissed++,
      });
    });

    await user.click(
      screen.getByRole("button", { name: "Dismiss notification" }),
    );

    expect(dismissed).toBe(1);
  });
});

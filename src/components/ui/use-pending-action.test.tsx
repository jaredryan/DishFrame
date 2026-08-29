import { describe, expect, it, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { usePendingAction } from "@/components/ui/use-pending-action";

describe("usePendingAction", () => {
  it("only marks the action that was actually run as pending", async () => {
    const { result } = renderHook(() => usePendingAction<"a" | "b">());
    let resolveA: () => void = () => {};
    const taskA = vi.fn(
      () => new Promise<void>((resolve) => (resolveA = resolve)),
    );

    act(() => {
      result.current.run("a", taskA);
    });

    await waitFor(() => expect(result.current.pendingAction).toBe("a"));
    expect(result.current.isPending).toBe(true);

    await act(async () => {
      resolveA();
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.pendingAction).toBeNull());
    expect(result.current.isPending).toBe(false);
  });
});

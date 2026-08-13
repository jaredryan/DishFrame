import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useChecklistState } from "@/components/domain/cooking/use-checklist-state";
import { toggleChecklistItem } from "@/lib/cooking/actions";

vi.mock("@/lib/cooking/actions", () => ({
  toggleChecklistItem: vi.fn(),
}));

const mockedToggle = vi.mocked(toggleChecklistItem);

beforeEach(() => {
  mockedToggle.mockReset();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const units = [
  { checklistItems: [{ id: "item-1", checkedAt: null as string | null }] },
];

describe("useChecklistState — same-item toggle race", () => {
  it("collapses rapid unchecked→checked→unchecked→checked clicks into a single write matching the final state", async () => {
    const d1 = deferred<{ status: "success" }>();
    mockedToggle.mockReturnValueOnce(d1.promise);

    const { result } = renderHook(() =>
      useChecklistState("session-1", units, vi.fn()),
    );

    act(() => result.current.toggle("item-1", true));
    act(() => result.current.toggle("item-1", false));
    act(() => result.current.toggle("item-1", true));

    // UI settles on the final click immediately, before any save resolves.
    expect(result.current.isChecked(units[0].checklistItems[0])).toBe(true);

    // Only one request is ever in flight for the item — no request was
    // fired for the transient `false` state, since it was superseded by
    // the final `true` before its predecessor resolved.
    expect(mockedToggle).toHaveBeenCalledTimes(1);
    expect(mockedToggle).toHaveBeenCalledWith({
      sessionId: "session-1",
      itemId: "item-1",
      checked: true,
    });

    await act(async () => {
      d1.resolve({ status: "success" });
      await result.current.flush();
    });

    // Settling that one in-flight request didn't trigger a further write,
    // since it already matched the final intended state.
    expect(mockedToggle).toHaveBeenCalledTimes(1);
  });

  it("fires a corrective follow-up write once an in-flight save resolves to a value the user has since changed", async () => {
    const d1 = deferred<{ status: "success" }>();
    const d2 = deferred<{ status: "success" }>();
    mockedToggle
      .mockReturnValueOnce(d1.promise)
      .mockReturnValueOnce(d2.promise);

    const { result } = renderHook(() =>
      useChecklistState("session-1", units, vi.fn()),
    );

    act(() => result.current.toggle("item-1", true));
    // A newer click arrives while the `true` save is still in flight.
    act(() => result.current.toggle("item-1", false));

    expect(mockedToggle).toHaveBeenCalledTimes(1);

    // The first (now-stale) request resolves. Because a newer intent
    // (`false`) arrived while it was in flight, a corrective second
    // request must fire — this is what guarantees the DB can never be left
    // on a value older than the user's last click, regardless of network
    // completion order.
    await act(async () => {
      d1.resolve({ status: "success" });
    });

    await waitFor(() => expect(mockedToggle).toHaveBeenCalledTimes(2));
    expect(mockedToggle).toHaveBeenLastCalledWith({
      sessionId: "session-1",
      itemId: "item-1",
      checked: false,
    });

    await act(async () => {
      d2.resolve({ status: "success" });
      await result.current.flush();
    });

    expect(result.current.isChecked(units[0].checklistItems[0])).toBe(false);
    expect(mockedToggle).toHaveBeenCalledTimes(2);
  });
});

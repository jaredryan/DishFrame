import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useChecklistState } from "@/components/domain/cooking/use-checklist-state";

// The hook now persists via runOrQueueMutation → fetch("/api/sync/cooking",
// ...) instead of calling the `toggleChecklistItem` Server Action directly
// (docs/OFFLINE_IMPLEMENTATION_PLAN.md's stable sync API) — these tests
// stub `fetch` and inspect the posted request body instead of mocking that
// action.

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function appliedResponse() {
  return new Response(
    JSON.stringify({
      status: "applied",
      entityId: "session-1",
      serverRevision: null,
    }),
    { status: 200 },
  );
}

function lastFetchPayload(fetchMock: ReturnType<typeof vi.fn>) {
  const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  const init = lastCall[1] as RequestInit;
  const parsed = JSON.parse(init.body as string) as {
    mutationId: string;
    op: string;
    entityId: string;
    payload: unknown;
  };
  const rest = { ...parsed };
  delete (rest as { mutationId?: string }).mutationId;
  return rest as {
    op: string;
    entityId: string;
    payload: unknown;
  };
}

const units = [
  { checklistItems: [{ id: "item-1", checkedAt: null as string | null }] },
];

describe("useChecklistState — same-item toggle race", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("collapses rapid unchecked→checked→unchecked→checked clicks into a single write matching the final state", async () => {
    const d1 = deferred<Response>();
    fetchMock.mockReturnValueOnce(d1.promise);

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
    // the final `true` before its predecessor resolved. The request itself
    // fires behind an optimistic IndexedDB write (`runOrQueueMutation`), so
    // it isn't necessarily posted by the time the synchronous clicks above
    // return.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(lastFetchPayload(fetchMock)).toEqual({
      op: "cooking.toggleChecklistItem",
      entityId: "session-1",
      payload: { sessionId: "session-1", itemId: "item-1", checked: true },
    });

    await act(async () => {
      d1.resolve(appliedResponse());
      await result.current.flush();
    });

    // Settling that one in-flight request didn't trigger a further write,
    // since it already matched the final intended state.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fires a corrective follow-up write once an in-flight save resolves to a value the user has since changed", async () => {
    const d1 = deferred<Response>();
    const d2 = deferred<Response>();
    fetchMock.mockReturnValueOnce(d1.promise).mockReturnValueOnce(d2.promise);

    const { result } = renderHook(() =>
      useChecklistState("session-1", units, vi.fn()),
    );

    act(() => result.current.toggle("item-1", true));
    // A newer click arrives while the `true` save is still in flight.
    act(() => result.current.toggle("item-1", false));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // The first (now-stale) request resolves. Because a newer intent
    // (`false`) arrived while it was in flight, a corrective second
    // request must fire — this is what guarantees the DB can never be left
    // on a value older than the user's last click, regardless of network
    // completion order.
    await act(async () => {
      d1.resolve(appliedResponse());
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(lastFetchPayload(fetchMock)).toEqual({
      op: "cooking.toggleChecklistItem",
      entityId: "session-1",
      payload: { sessionId: "session-1", itemId: "item-1", checked: false },
    });

    await act(async () => {
      d2.resolve(appliedResponse());
      await result.current.flush();
    });

    expect(result.current.isChecked(units[0].checklistItems[0])).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

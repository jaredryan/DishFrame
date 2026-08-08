import { describe, it, expect, vi, beforeEach } from "vitest";

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/auth/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

import { getServerSession, requireUserId } from "@/lib/auth/session";
import { AuthorizationError } from "@/lib/errors";

beforeEach(() => {
  getSession.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("getServerSession", () => {
  it("returns the session when the lookup succeeds", async () => {
    const session = { session: { id: "s1" }, user: { id: "u1" } };
    getSession.mockResolvedValueOnce(session);
    await expect(getServerSession()).resolves.toEqual(session);
  });

  it("returns null instead of throwing when the underlying lookup fails", async () => {
    // Mirrors Better Auth's own getSession endpoint, which wraps any
    // internal failure (dead DB connection, broken session-store query) as
    // a thrown FAILED_TO_GET_SESSION APIError rather than returning null.
    getSession.mockRejectedValueOnce(new Error("FAILED_TO_GET_SESSION"));
    await expect(getServerSession()).resolves.toBeNull();
  });
});

describe("requireUserId", () => {
  it("throws AuthorizationError when the session lookup fails", async () => {
    getSession.mockRejectedValueOnce(new Error("FAILED_TO_GET_SESSION"));
    await expect(requireUserId()).rejects.toBeInstanceOf(AuthorizationError);
  });
});

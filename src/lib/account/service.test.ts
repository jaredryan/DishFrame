import { describe, expect, it } from "vitest";
import { isSessionFresh, describeUserAgent } from "@/lib/account/service";
import { SESSION_FRESH_AGE_SECONDS, type Session } from "@/lib/auth/auth";

const FRESH_AGE_MS = SESSION_FRESH_AGE_SECONDS * 1000;

function fakeSession(createdAt: Date, updatedAt: Date = createdAt): Session {
  return {
    session: {
      id: "session-1",
      token: "token-1",
      createdAt,
      updatedAt,
      userId: "user-1",
      expiresAt: new Date(createdAt.getTime() + 1000 * 60 * 60 * 24 * 30),
      ipAddress: null,
      userAgent: null,
    },
    user: {
      id: "user-1",
      name: "Test User",
      email: "test@example.invalid",
      emailVerified: false,
      createdAt,
      updatedAt,
      image: null,
    },
  } as unknown as Session;
}

describe("isSessionFresh", () => {
  it("is fresh just after creation", () => {
    expect(isSessionFresh(fakeSession(new Date()))).toBe(true);
  });

  it("is not fresh once created beyond the configured freshAge window", () => {
    const stale = new Date(Date.now() - FRESH_AGE_MS - 1000);
    expect(isSessionFresh(fakeSession(stale))).toBe(false);
  });

  it("matches the exact configured cutoff, not an independently guessed one", () => {
    const justInside = new Date(Date.now() - FRESH_AGE_MS + 5000);
    const justOutside = new Date(Date.now() - FRESH_AGE_MS - 5000);
    expect(isSessionFresh(fakeSession(justInside))).toBe(true);
    expect(isSessionFresh(fakeSession(justOutside))).toBe(false);
  });

  it("does not treat a bumped updatedAt (last-active) as re-authentication", () => {
    // Authenticated 25h ago (stale) but "active" a second ago — Better
    // Auth's own freshness rule keys off createdAt only, never updatedAt,
    // so routine activity must not silently re-extend this window.
    const oldCreatedAt = new Date(Date.now() - FRESH_AGE_MS - 1000);
    const recentUpdatedAt = new Date();
    expect(isSessionFresh(fakeSession(oldCreatedAt, recentUpdatedAt))).toBe(
      false,
    );
  });
});

describe("describeUserAgent", () => {
  it("describes an unknown user agent", () => {
    expect(describeUserAgent(null)).toBe("Unknown device");
  });

  it("recognizes Chrome on macOS", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    expect(describeUserAgent(ua)).toBe("Chrome on macOS");
  });

  it("recognizes Safari on iOS", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    expect(describeUserAgent(ua)).toBe("Safari on iOS");
  });

  it("recognizes Firefox on Windows", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0";
    expect(describeUserAgent(ua)).toBe("Firefox on Windows");
  });
});

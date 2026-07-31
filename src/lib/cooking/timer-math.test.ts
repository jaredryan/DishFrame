import { describe, it, expect } from "vitest";
import {
  remainingSecondsAt,
  isTimerExpired,
  formatCountdown,
} from "@/lib/cooking/timer-math";

const NOW = new Date("2026-07-31T12:00:00.000Z").getTime();

describe("remainingSecondsAt", () => {
  it("derives remaining seconds from targetEndAt while RUNNING (§29.4)", () => {
    const timer = {
      state: "RUNNING" as const,
      targetEndAt: new Date(NOW + 90_000).toISOString(),
      remainingSeconds: null,
      durationSeconds: 120,
    };
    expect(remainingSecondsAt(timer, NOW)).toBe(90);
  });

  it("clamps to zero once the target time has passed", () => {
    const timer = {
      state: "RUNNING" as const,
      targetEndAt: new Date(NOW - 5_000).toISOString(),
      remainingSeconds: null,
      durationSeconds: 60,
    };
    expect(remainingSecondsAt(timer, NOW)).toBe(0);
  });

  it("uses the stored remainingSeconds while PAUSED", () => {
    const timer = {
      state: "PAUSED" as const,
      targetEndAt: null,
      remainingSeconds: 42,
      durationSeconds: 120,
    };
    expect(remainingSecondsAt(timer, NOW)).toBe(42);
  });

  it("falls back to durationSeconds when a paused timer has no remainingSeconds recorded", () => {
    const timer = {
      state: "PAUSED" as const,
      targetEndAt: null,
      remainingSeconds: null,
      durationSeconds: 300,
    };
    expect(remainingSecondsAt(timer, NOW)).toBe(300);
  });
});

describe("isTimerExpired", () => {
  it("is false while RUNNING with a future target", () => {
    const timer = {
      state: "RUNNING" as const,
      targetEndAt: new Date(NOW + 1_000).toISOString(),
      remainingSeconds: null,
      durationSeconds: 60,
    };
    expect(isTimerExpired(timer, NOW)).toBe(false);
  });

  it("is true once a RUNNING timer's target time has passed", () => {
    const timer = {
      state: "RUNNING" as const,
      targetEndAt: new Date(NOW - 1_000).toISOString(),
      remainingSeconds: null,
      durationSeconds: 60,
    };
    expect(isTimerExpired(timer, NOW)).toBe(true);
  });

  it("is never true for a PAUSED, EXPIRED, or DISMISSED timer", () => {
    for (const state of ["PAUSED", "EXPIRED", "DISMISSED"] as const) {
      expect(
        isTimerExpired(
          {
            state,
            targetEndAt: new Date(NOW - 1_000).toISOString(),
            remainingSeconds: 0,
            durationSeconds: 60,
          },
          NOW,
        ),
      ).toBe(false);
    }
  });
});

describe("formatCountdown", () => {
  it("formats under an hour as m:ss", () => {
    expect(formatCountdown(65)).toBe("1:05");
  });

  it("formats an hour or more as h:mm:ss", () => {
    expect(formatCountdown(3725)).toBe("1:02:05");
  });

  it("clamps negative input to zero", () => {
    expect(formatCountdown(-5)).toBe("0:00");
  });
});

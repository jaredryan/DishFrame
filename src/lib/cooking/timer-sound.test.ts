import { describe, it, expect, vi, beforeEach } from "vitest";

class FakeGain {
  gain = {
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
  connect = vi.fn();
}

class FakeOscillator {
  type = "";
  frequency = { setValueAtTime: vi.fn() };
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

describe("playTimerDing", () => {
  let oscillators: FakeOscillator[];
  let playTimerDing: typeof import("@/lib/cooking/timer-sound").playTimerDing;

  // The module caches its AudioContext singleton across calls, so each test
  // needs a fresh module instance to get an isolated, trackable context.
  beforeEach(async () => {
    vi.resetModules();
    oscillators = [];
    class TrackingAudioContext {
      currentTime = 0;
      destination = {};
      createGain() {
        return new FakeGain();
      }
      createOscillator() {
        const osc = new FakeOscillator();
        oscillators.push(osc);
        return osc;
      }
    }
    // @ts-expect-error -- minimal AudioContext test double
    window.AudioContext = TrackingAudioContext;
    ({ playTimerDing } = await import("@/lib/cooking/timer-sound"));
  });

  it("schedules a multi-second jingle (~2-3s), not a single brief ding (item 9)", () => {
    playTimerDing();

    expect(oscillators.length).toBeGreaterThan(1);
    const lastStop = Math.max(
      ...oscillators.map((osc) => osc.stop.mock.calls[0][0] as number),
    );
    expect(lastStop).toBeGreaterThanOrEqual(2);
    expect(lastStop).toBeLessThanOrEqual(3);
  });

  it("schedules its fixed note sequence once per call, never an unbounded loop", () => {
    playTimerDing();
    const firstCallCount = oscillators.length;

    playTimerDing();

    expect(oscillators.length).toBe(firstCallCount * 2);
  });
});

"use client";

let audioContext: AudioContext | null = null;

type WindowWithWebkitAudio = Window & {
  webkitAudioContext?: typeof AudioContext;
};

/**
 * PRODUCT_SPEC.md §29.6 — "a brief ding or short sound rather than a
 * prolonged alarm." Synthesized via WebAudio instead of shipping an audio
 * asset. Silently no-ops if WebAudio is unavailable or a browser autoplay
 * policy blocks it — the visible/accessible alert this accompanies never
 * depends on sound actually playing.
 */
export function playTimerDing() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as WindowWithWebkitAudio).webkitAudioContext;
    if (!Ctx) return;
    audioContext ??= new Ctx();
    const ctx = audioContext;
    const now = ctx.currentTime;

    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.4);
  } catch {
    // Never let a sound failure break the accompanying visible/accessible alert.
  }
}

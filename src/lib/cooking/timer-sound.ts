"use client";

let audioContext: AudioContext | null = null;

type WindowWithWebkitAudio = Window & {
  webkitAudioContext?: typeof AudioContext;
};

// Refinement pass item 9: a single ding was too subtle to hear over kitchen
// noise. This alternating two-note motif, repeated JINGLE_REPEATS times, is
// fully scheduled up front against one `now` — no interval/timeout — so it
// plays once end-to-end and can't loop or re-trigger on a rerender.
const NOTES_HZ = [1046.5, 1318.51]; // C6, E6
const NOTE_DURATION_S = 0.22;
const NOTE_SPACING_S = 0.32;
const JINGLE_REPEATS = 8;

/**
 * PRODUCT_SPEC.md §29.6, refinement pass item 9 — the prior "brief ding" was
 * too subtle to reliably hear during normal kitchen activity; this plays a
 * ~2.5s jingle once per expiration. Synthesized via WebAudio instead of
 * shipping an audio asset. Silently no-ops if WebAudio is unavailable or a
 * browser autoplay policy blocks it — the visible/accessible alert this
 * accompanies never depends on sound actually playing.
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

    for (let i = 0; i < JINGLE_REPEATS; i++) {
      const start = now + i * NOTE_SPACING_S;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(NOTES_HZ[i % NOTES_HZ.length], start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.22, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + NOTE_DURATION_S);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + NOTE_DURATION_S + 0.05);
    }
  } catch {
    // Never let a sound failure break the accompanying visible/accessible alert.
  }
}

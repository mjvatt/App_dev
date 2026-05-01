"use client";

// Synthesized arcade sounds via Web Audio API. No asset files, no
// licensing concerns, no bundle bloat. Default is MUTED — sound
// surprises users on a quiet office; opt-in via the toggle in the
// dashboard sidebar.

const STORAGE_KEY = "puc_sound_enabled";

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  // Safari still ships only the webkit-prefixed alias. Cast through
  // unknown so TS doesn't fight us on the global lookup.
  const w = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

export function isSoundEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

export function setSoundEnabled(on: boolean): void {
  if (typeof window === "undefined") return;
  if (on) {
    window.localStorage.setItem(STORAGE_KEY, "1");
    // Browsers require a user gesture to start the AudioContext; toggling
    // is a gesture, so resume here so the first sound after enabling
    // actually fires instead of being swallowed.
    getContext()?.resume();
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

interface ToneStep {
  freq: number;
  duration: number;
  delay?: number;
  type?: OscillatorType;
  gain?: number;
}

function play(steps: ToneStep[]): void {
  if (!isSoundEnabled()) return;
  const c = getContext();
  if (!c) return;
  // The context can suspend itself on inactive tabs; resume defensively.
  if (c.state === "suspended") void c.resume();
  const now = c.currentTime;
  for (const step of steps) {
    const t0 = now + (step.delay ?? 0);
    const peak = step.gain ?? 0.12;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = step.type ?? "sine";
    osc.frequency.value = step.freq;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + step.duration);
    osc.connect(gain).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + step.duration);
  }
}

// Quick rising two-tone "ding" — fires on a passing attempt.
export function playPass(): void {
  play([
    { freq: 587.33, duration: 0.12 },               // D5
    { freq: 880, duration: 0.18, delay: 0.08 },      // A5
  ]);
}

// Low descending thunk — fires on a failed attempt.
export function playFail(): void {
  play([
    { freq: 220, duration: 0.18, type: "sawtooth", gain: 0.10 }, // A3
    { freq: 165, duration: 0.25, delay: 0.10, type: "sawtooth", gain: 0.10 }, // E3
  ]);
}

// Triumphant ascending arpeggio — fires on level-up.
export function playLevelUp(): void {
  play([
    { freq: 523.25, duration: 0.12 },                // C5
    { freq: 659.25, duration: 0.12, delay: 0.10 },   // E5
    { freq: 783.99, duration: 0.12, delay: 0.20 },   // G5
    { freq: 1046.5, duration: 0.32, delay: 0.30 },   // C6
  ]);
}

// Heavier square-wave fanfare — fires on Boss Rush completion or
// passing a boss-tier challenge in Quick Play.
export function playBossDefeated(): void {
  play([
    { freq: 440, duration: 0.15, type: "square", gain: 0.10 },               // A4
    { freq: 523.25, duration: 0.15, delay: 0.12, type: "square", gain: 0.10 }, // C5
    { freq: 659.25, duration: 0.15, delay: 0.24, type: "square", gain: 0.10 }, // E5
    { freq: 880, duration: 0.45, delay: 0.36, type: "square", gain: 0.12 },    // A5
  ]);
}

// Sad descending horn — fires on Boss Rush wipe.
export function playWipe(): void {
  play([
    { freq: 330, duration: 0.20, type: "triangle", gain: 0.12 },
    { freq: 294, duration: 0.20, delay: 0.18, type: "triangle", gain: 0.12 },
    { freq: 247, duration: 0.45, delay: 0.36, type: "triangle", gain: 0.12 },
  ]);
}

// Rapid ascending chime — fires on streak milestones.
export function playStreakMilestone(): void {
  play([
    { freq: 659.25, duration: 0.10 },                // E5
    { freq: 783.99, duration: 0.10, delay: 0.08 },   // G5
    { freq: 987.77, duration: 0.20, delay: 0.16 },   // B5
  ]);
}

"use client";

import { useEffect, useState } from "react";
import { isSoundEnabled, playPass, setSoundEnabled } from "@/lib/sounds";

interface Props {
  className?: string;
}

export default function SoundToggle({ className }: Props) {
  const [on, setOn] = useState<boolean | null>(null);

  useEffect(() => {
    setOn(isSoundEnabled());
  }, []);

  function toggle() {
    if (on === null) return;
    const next = !on;
    setSoundEnabled(next);
    setOn(next);
    // Confirmation chime when turning sounds ON; turning OFF stays
    // silent so the user isn't told "shutting up" out loud.
    if (next) playPass();
  }

  // SSR placeholder — same footprint as the real button so layout
  // doesn't shift after hydration.
  if (on === null) {
    return (
      <div
        className={`px-3 py-2 rounded-lg text-zinc-700 text-sm ${className ?? ""}`}
        aria-hidden
      >
        <SpeakerIcon muted />
        <span className="sr-only">Sounds (loading)</span>
      </div>
    );
  }

  return (
    <button
      onClick={toggle}
      aria-label={on ? "Mute sounds" : "Enable sounds"}
      title={on ? "Mute sounds" : "Enable sounds"}
      className={`px-3 py-2 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-900 transition-colors text-sm flex items-center gap-2 ${className ?? ""}`}
    >
      <SpeakerIcon muted={!on} />
      <span className="text-xs">{on ? "Sounds on" : "Sounds off"}</span>
    </button>
  );
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0"
      fill="currentColor"
      aria-hidden
    >
      {/* Speaker cone */}
      <path d="M11 5L6 9H3v6h3l5 4z" />
      {muted ? (
        // X over the cone
        <path d="M16.5 9.5l4 4M20.5 9.5l-4 4" stroke="currentColor" strokeWidth="2" fill="none" />
      ) : (
        // Two arcs for waves
        <path
          d="M14.5 8.5a4 4 0 010 7M16.5 6.5a7 7 0 010 11"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
        />
      )}
    </svg>
  );
}

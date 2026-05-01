"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Standard DOM types don't ship SpeechRecognition (the spec is still
// draft) so we model the small surface we use ourselves. Keeps us off
// a third-party stub package without giving up type safety at the call
// site.
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult:
    | ((event: {
        results: ArrayLike<ArrayLike<{ transcript: string }>> & {
          [index: number]: { isFinal: boolean };
        };
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface UseSpeechRecognitionOptions {
  /** Called once per finalized phrase. Use this to append to your own
   * transcript buffer; the hook does not store the rolling final text
   * itself so the caller stays the single source of truth. */
  onFinalTranscript?: (text: string) => void;
  /** BCP-47 tag. Defaults to en-US. */
  lang?: string;
}

export interface UseSpeechRecognitionReturn {
  /** null until the first effect runs (SSR-safe), then true/false. */
  supported: boolean | null;
  /** True while a session is active. Flips back to false on stop,
   * onend timeouts from the browser, or onerror. */
  recording: boolean;
  /** Live in-progress text the browser hasn't finalized yet. Empty
   * once each phrase resolves. */
  interim: string;
  error: string | null;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions = {}
): UseSpeechRecognitionReturn {
  const { onFinalTranscript, lang = "en-US" } = options;

  const [supported, setSupported] = useState<boolean | null>(null);
  const [recording, setRecording] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onFinalRef = useRef(onFinalTranscript);

  // Keep the callback fresh without invalidating start/stop on every
  // render — calls inside onresult always see the current handler.
  useEffect(() => {
    onFinalRef.current = onFinalTranscript;
  }, [onFinalTranscript]);

  useEffect(() => {
    setSupported(getRecognitionCtor() !== null);
    return () => {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    };
  }, []);

  const start = useCallback(() => {
    if (recognitionRef.current) return;
    const Ctor = getRecognitionCtor();
    if (Ctor === null) {
      setSupported(false);
      return;
    }

    setError(null);
    setInterim("");

    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang;

    rec.onresult = (event) => {
      let finalChunk = "";
      let interimChunk = "";
      const len = (event.results as { length: number }).length;
      for (let i = 0; i < len; i++) {
        const result = event.results[i] as unknown as {
          isFinal: boolean;
          0: { transcript: string };
        };
        const piece = result[0]?.transcript ?? "";
        if (result.isFinal) {
          finalChunk += piece;
        } else {
          interimChunk += piece;
        }
      }
      const trimmed = finalChunk.trim();
      if (trimmed && onFinalRef.current) {
        onFinalRef.current(trimmed);
      }
      setInterim(interimChunk);
    };

    rec.onerror = (event) => {
      setError(`Recording error: ${event.error}.`);
      setRecording(false);
    };

    rec.onend = () => {
      setRecording(false);
      setInterim("");
      recognitionRef.current = null;
    };

    recognitionRef.current = rec;
    rec.start();
    setRecording(true);
  }, [lang]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const reset = useCallback(() => {
    recognitionRef.current?.stop();
    setInterim("");
    setError(null);
  }, []);

  return { supported, recording, interim, error, start, stop, reset };
}

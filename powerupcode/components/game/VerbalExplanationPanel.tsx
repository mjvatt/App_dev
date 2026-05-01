"use client";

import { useEffect, useRef, useState } from "react";
import { authedRequest } from "@/lib/api";
import type { ExplanationGrade } from "@/lib/types";

type Phase = "idle" | "recording" | "grading" | "graded" | "error";

interface Props {
  challengeId: string;
  solution: string;
}

// Minimal type shim for Web Speech API. Standard DOM types don't ship
// SpeechRecognition because the spec is still draft; using `any` for
// the event payload here keeps the surface small without dragging in
// a stub package.
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> & { [index: number]: { isFinal: boolean } } }) => void) | null;
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

export default function VerbalExplanationPanel({ challengeId, solution }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [grade, setGrade] = useState<ExplanationGrade | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [speechSupported, setSpeechSupported] = useState<boolean | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    setSpeechSupported(getRecognitionCtor() !== null);
  }, []);

  function startRecording() {
    setError(null);
    setTranscript("");
    setInterim("");
    setGrade(null);

    const Ctor = getRecognitionCtor();
    if (Ctor === null) {
      setSpeechSupported(false);
      return;
    }

    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";

    rec.onresult = (event) => {
      let finalChunk = "";
      let interimChunk = "";
      // Iterate using the shape we know exists; the standard object is
      // SpeechRecognitionResultList and entries are SpeechRecognitionResult.
      for (let i = 0; i < (event.results as { length: number }).length; i++) {
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
      if (finalChunk) {
        setTranscript((prev) => (prev + " " + finalChunk).trim());
      }
      setInterim(interimChunk);
    };

    rec.onerror = (event) => {
      setPhase("error");
      setError(`Recording error: ${event.error}. Try the typed fallback below.`);
    };

    rec.onend = () => {
      // Browser ended the recognition session (timeout, network, etc.);
      // we only flip to "idle" if the user hasn't already moved to the
      // grading phase via the Stop button.
      setPhase((current) => (current === "recording" ? "idle" : current));
    };

    recognitionRef.current = rec;
    rec.start();
    setPhase("recording");
  }

  function stopRecording() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setInterim("");
    // If we have nothing to grade, drop back to idle without a server call.
    setPhase((current) => (current === "recording" ? "idle" : current));
  }

  async function submitForGrading(text: string) {
    if (!text.trim()) {
      setError("Nothing to grade — say (or type) something first.");
      return;
    }
    setPhase("grading");
    setError(null);
    try {
      const result = await authedRequest<ExplanationGrade>(
        `/api/challenges/${challengeId}/explanation`,
        {
          method: "POST",
          body: JSON.stringify({ solution, transcript: text }),
        }
      );
      setGrade(result);
      setPhase(result.available ? "graded" : "error");
      if (!result.available) {
        setError(result.feedback || "Grading is unavailable right now.");
      }
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : "Failed to grade explanation.");
    }
  }

  function reset() {
    setPhase("idle");
    setTranscript("");
    setInterim("");
    setGrade(null);
    setError(null);
  }

  // Initial detection still pending — render nothing to avoid flicker.
  if (speechSupported === null) return null;

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-white">Explain it out loud</p>
        <p className="text-xs text-zinc-500">
          Optional — graded on clarity, completeness, communication.
        </p>
      </div>

      {phase === "idle" && (
        <div className="flex flex-col gap-3">
          {speechSupported ? (
            <button
              onClick={startRecording}
              className="self-start px-4 py-2 bg-white text-black text-sm font-semibold rounded-lg hover:bg-zinc-200 transition-colors"
            >
              Start recording
            </button>
          ) : (
            <p className="text-xs text-zinc-500">
              Speech recognition isn&apos;t supported in this browser. Type your
              explanation below instead.
            </p>
          )}
          {!speechSupported && (
            <TypedFallback onSubmit={submitForGrading} />
          )}
        </div>
      )}

      {phase === "recording" && (
        <div className="flex flex-col gap-3">
          <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-3 min-h-[80px] text-sm text-zinc-200">
            {transcript}
            {interim && <span className="text-zinc-500"> {interim}</span>}
            {!transcript && !interim && (
              <span className="text-zinc-600">Listening — start explaining.</span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={stopRecording}
              className="px-4 py-2 border border-zinc-700 text-white text-sm font-semibold rounded-lg hover:border-white transition-colors"
            >
              Stop
            </button>
            <button
              onClick={() => {
                stopRecording();
                submitForGrading(transcript);
              }}
              disabled={!transcript.trim()}
              className="px-4 py-2 bg-white text-black text-sm font-semibold rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Stop &amp; grade
            </button>
          </div>
        </div>
      )}

      {phase === "grading" && (
        <div className="flex items-center gap-3 text-sm text-zinc-400">
          <span className="inline-block h-3 w-3 rounded-full bg-zinc-500 animate-pulse" />
          Grading your explanation…
        </div>
      )}

      {phase === "graded" && grade && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <Score label="Overall" value={`${grade.overall}/100`} highlight />
            <Score label="Correct" value={`${grade.correctness}/5`} />
            <Score label="Clarity" value={`${grade.clarity}/5`} />
            <Score label="Complete" value={`${grade.completeness}/5`} />
            <Score label="Communication" value={`${grade.communication}/5`} />
          </div>
          <p className="text-sm text-zinc-300 leading-relaxed">{grade.feedback}</p>
          <button
            onClick={reset}
            className="self-start px-4 py-2 border border-zinc-700 text-white text-sm font-semibold rounded-lg hover:border-white transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {phase === "error" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-red-400">{error}</p>
          <button
            onClick={reset}
            className="self-start px-3 py-1.5 border border-zinc-700 text-white text-xs font-semibold rounded-lg hover:border-white transition-colors"
          >
            Reset
          </button>
        </div>
      )}
    </div>
  );
}

function Score({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg p-3 ${
        highlight ? "bg-white text-black" : "bg-zinc-900 text-white"
      }`}
    >
      <p className={`text-xs ${highlight ? "text-zinc-600" : "text-zinc-500"} mb-1`}>
        {label}
      </p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}

function TypedFallback({
  onSubmit,
}: {
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState("");
  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder="Type the explanation you would say out loud."
        className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-white"
      />
      <button
        onClick={() => onSubmit(text)}
        disabled={!text.trim()}
        className="self-start px-4 py-2 bg-white text-black text-sm font-semibold rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Grade explanation
      </button>
    </div>
  );
}

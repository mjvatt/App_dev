import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { authedRequest } from "@/lib/api";
import { getToken } from "@/lib/auth";
import MonacoEditor from "@/components/game/MonacoEditor";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import TierBadge from "@/components/game/TierBadge";
import { Difficulty as TierDifficulty, colors, fontSize, radius, spacing } from "@/lib/theme";

const SOFT_TARGET_MIN = 30;
const FREEZE_BONUS_MIN = 5;
const FREEZE_COST = 5;
const TIME_FREEZE_CAP = 3;
const AMBER_AT_REMAINING_MIN = 5;
const RED_AT_OVER_MIN = 5;

type Language = "python" | "javascript" | "typescript" | "java";
const LANGUAGES: Language[] = ["python", "javascript", "typescript", "java"];

type TopicKey =
  | "any"
  | "arrays"
  | "strings"
  | "linked_lists"
  | "trees"
  | "graphs"
  | "dynamic_programming"
  | "system_design";

const TOPICS: { key: TopicKey; label: string }[] = [
  { key: "any", label: "Any" },
  { key: "arrays", label: "Arrays" },
  { key: "strings", label: "Strings" },
  { key: "linked_lists", label: "Linked Lists" },
  { key: "trees", label: "Trees" },
  { key: "graphs", label: "Graphs" },
  { key: "dynamic_programming", label: "DP" },
  { key: "system_design", label: "System Design" },
];

type DifficultyKey = "any" | "easy" | "medium" | "hard" | "boss";
const DIFFICULTIES: DifficultyKey[] = ["any", "easy", "medium", "hard", "boss"];

interface Challenge {
  id: string;
  topic: string;
  difficulty: string;
  title: string;
  prompt: string;
  constraints: string[];
  examples: { input?: string; output?: string }[];
}

interface SessionResponse {
  id: string;
  status: "in_progress" | "completed" | "abandoned";
  challenge: Challenge;
  topic: string | null;
  difficulty: string | null;
  started_at: string;
  ended_at: string | null;
  overall_score: number | null;
  feedback: string | null;
  strengths: string[];
  improvements: string[];
  time_ms: number | null;
  tokens_earned: number;
  time_freezes_used: number;
}

interface ProgressSnapshot {
  token_balance: number;
}

type Screen = "landing" | "session" | "report";

function formatMmSs(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function asTierDifficulty(raw: string): TierDifficulty | null {
  if (raw === "easy" || raw === "medium" || raw === "hard" || raw === "boss") {
    return raw;
  }
  return null;
}

export default function InterviewScreen() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [topic, setTopic] = useState<TopicKey>("any");
  const [difficulty, setDifficulty] = useState<DifficultyKey>("any");
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [code, setCode] = useState("");
  const [transcript, setTranscript] = useState("");
  const [language, setLanguage] = useState<Language>("python");
  const [elapsedSec, setElapsedSec] = useState(0);
  const [tokens, setTokens] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [freezing, setFreezing] = useState(false);
  const [error, setError] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchTokens = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const data = await authedRequest<ProgressSnapshot>("/api/progress/me", token);
      setTokens(data.token_balance);
    } catch {
      // Non-fatal.
    }
  }, []);

  useEffect(() => {
    if (screen !== "session") {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    timerRef.current = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [screen]);

  useEffect(() => { fetchTokens(); }, [fetchTokens]);

  async function startSession() {
    setStarting(true);
    setError("");
    try {
      const token = await getToken();
      if (!token) return;
      const body: { topic?: string; difficulty?: string } = {};
      if (topic !== "any") body.topic = topic;
      if (difficulty !== "any") body.difficulty = difficulty;
      const data = await authedRequest<SessionResponse>(
        "/api/interviews/start",
        token,
        { method: "POST", body: JSON.stringify(body) },
      );
      setSession(data);
      setCode("");
      setTranscript("");
      setElapsedSec(0);
      setScreen("session");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start interview.");
    } finally {
      setStarting(false);
    }
  }

  async function submitSession() {
    if (!session || !code.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const token = await getToken();
      if (!token) return;
      const data = await authedRequest<SessionResponse>(
        `/api/interviews/${session.id}/end`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            solution: code,
            transcript,
            language,
            time_ms: elapsedSec * 1000,
          }),
        },
      );
      setSession(data);
      setScreen("report");
      await fetchTokens();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function timeFreeze() {
    if (!session) return;
    setFreezing(true);
    setError("");
    try {
      const token = await getToken();
      if (!token) return;
      const data = await authedRequest<SessionResponse>(
        `/api/interviews/${session.id}/time-freeze`,
        token,
        { method: "POST", body: JSON.stringify({}) },
      );
      setSession(data);
      await fetchTokens();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("402")) setError("Not enough power-up tokens.");
      else if (msg.includes("409")) setError("Time-freeze cap reached for this session.");
      else setError(msg || "Time-freeze failed.");
    } finally {
      setFreezing(false);
    }
  }

  function resetToLanding() {
    setScreen("landing");
    setSession(null);
    setCode("");
    setTranscript("");
    setElapsedSec(0);
    setError("");
  }

  if (screen === "landing") {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.container}>
          <View>
            <Text style={styles.screenTitle}>Mock Interview</Text>
            <Text style={styles.subtitle}>
              One problem, soft 30-minute target, AI-graded post-mortem.
            </Text>
          </View>

          {!!error && (
            <Card style={styles.errorCard}>
              <Text style={styles.errorText}>{error}</Text>
            </Card>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Topic</Text>
            <View style={styles.chipRow}>
              {TOPICS.map((t) => (
                <TouchableOpacity
                  key={t.key}
                  onPress={() => setTopic(t.key)}
                  style={[
                    styles.chip,
                    topic === t.key && styles.chipActive,
                  ]}
                >
                  <Text style={[styles.chipLabel, topic === t.key && styles.chipLabelActive]}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Difficulty</Text>
            <View style={styles.chipRow}>
              {DIFFICULTIES.map((d) => (
                <TouchableOpacity
                  key={d}
                  onPress={() => setDifficulty(d)}
                  style={[
                    styles.chip,
                    difficulty === d && styles.chipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.chipLabel,
                      difficulty === d && styles.chipLabelActive,
                    ]}
                  >
                    {d.charAt(0).toUpperCase() + d.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <Button
            label={starting ? "Starting…" : "Start session"}
            onPress={startSession}
            loading={starting}
            fullWidth
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screen === "session" && session) {
    const targetSec = (SOFT_TARGET_MIN + session.time_freezes_used * FREEZE_BONUS_MIN) * 60;
    const remainingSec = targetSec - elapsedSec;
    const amberCutoff = AMBER_AT_REMAINING_MIN * 60;
    const redCutoff = -RED_AT_OVER_MIN * 60;
    let timerColor: string = colors.textMuted;
    if (remainingSec <= redCutoff) timerColor = colors.error;
    else if (remainingSec <= amberCutoff) timerColor = colors.warning;
    const canFreeze =
      session.time_freezes_used < TIME_FREEZE_CAP &&
      tokens !== null &&
      tokens >= FREEZE_COST;
    const tier = asTierDifficulty(session.challenge.difficulty);

    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.header}>
            <Text style={styles.screenTitle}>Interview</Text>
            <View style={styles.headerMeta}>
              <Text style={[styles.timer, { color: timerColor }]}>
                {formatMmSs(elapsedSec)}
              </Text>
              {tokens !== null && (
                <View style={styles.tokenChip}>
                  <MaterialCommunityIcons
                    name="lightning-bolt"
                    size={14}
                    color={colors.warning}
                  />
                  <Text style={styles.tokenChipText}>{tokens}</Text>
                </View>
              )}
            </View>
          </View>

          {!!error && (
            <Card style={styles.errorCard}>
              <Text style={styles.errorText}>{error}</Text>
            </Card>
          )}

          <Card style={styles.challengeCard}>
            <View style={styles.challengeHeader}>
              <Text style={styles.challengeTitle}>{session.challenge.title}</Text>
              {tier && <TierBadge difficulty={tier} size="sm" />}
            </View>
            <Text style={styles.prompt}>{session.challenge.prompt}</Text>
            {session.challenge.constraints.length > 0 && (
              <View style={styles.constraints}>
                <Text style={styles.constraintsLabel}>Constraints</Text>
                {session.challenge.constraints.map((c, i) => (
                  <Text key={i} style={styles.constraintsLine}>· {c}</Text>
                ))}
              </View>
            )}
          </Card>

          <View style={styles.langRow}>
            {LANGUAGES.map((l) => (
              <TouchableOpacity
                key={l}
                onPress={() => setLanguage(l)}
                style={[styles.langBtn, language === l && styles.langBtnActive]}
              >
                <Text
                  style={[
                    styles.langLabel,
                    language === l && styles.langLabelActive,
                  ]}
                >
                  {l}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <MonacoEditor
            language={language}
            value={code}
            onChange={setCode}
            height={280}
          />

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              Verbal explanation (typed for now)
            </Text>
            <TextInput
              value={transcript}
              onChangeText={setTranscript}
              multiline
              placeholder="Walk through your approach: complexity, edge cases, trade-offs…"
              placeholderTextColor={colors.textDim}
              style={styles.transcript}
            />
          </View>

          <Button
            label={submitting ? "Submitting…" : "Submit for grading"}
            onPress={submitSession}
            loading={submitting}
            fullWidth
          />

          {canFreeze && (
            <Button
              label={`+${FREEZE_BONUS_MIN} min · ${FREEZE_COST} ⚡ (${session.time_freezes_used}/${TIME_FREEZE_CAP})`}
              onPress={timeFreeze}
              loading={freezing}
              variant="secondary"
            />
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screen === "report" && session) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.screenTitle}>Post-mortem</Text>

          <Card style={styles.reportCard}>
            <View style={styles.scoreRow}>
              <Text style={styles.scoreValue}>
                {session.overall_score ?? "—"}
              </Text>
              <Text style={styles.scoreOutOf}>/ 100</Text>
              {session.tokens_earned > 0 && (
                <View style={[styles.tokenChip, { marginLeft: "auto" }]}>
                  <MaterialCommunityIcons
                    name="lightning-bolt"
                    size={14}
                    color={colors.warning}
                  />
                  <Text style={styles.tokenChipText}>
                    +{session.tokens_earned}
                  </Text>
                </View>
              )}
            </View>
            {session.feedback && (
              <Text style={styles.reportFeedback}>{session.feedback}</Text>
            )}
          </Card>

          {session.strengths.length > 0 && (
            <Card style={styles.listCard}>
              <Text style={styles.listLabel}>Strengths</Text>
              {session.strengths.map((s, i) => (
                <Text key={i} style={styles.listLine}>· {s}</Text>
              ))}
            </Card>
          )}

          {session.improvements.length > 0 && (
            <Card style={styles.listCard}>
              <Text style={styles.listLabel}>Improvements</Text>
              {session.improvements.map((s, i) => (
                <Text key={i} style={styles.listLine}>· {s}</Text>
              ))}
            </Card>
          )}

          <Button label="Run another" onPress={resetToLanding} />
          <Button
            label="Back to Arcade"
            onPress={() => router.push("/(app)/arcade")}
            variant="secondary"
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Fallback while transitioning.
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  screenTitle: { color: colors.text, fontSize: fontSize.xxl, fontWeight: "800" },
  subtitle: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: 4 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerMeta: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  timer: { fontSize: fontSize.lg, fontWeight: "700", fontVariant: ["tabular-nums"] },
  tokenChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    backgroundColor: colors.warning + "20",
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.warning + "60",
  },
  tokenChipText: { color: colors.warning, fontSize: fontSize.sm, fontWeight: "700" },
  errorCard: { borderColor: colors.error, backgroundColor: "#1a0000" },
  errorText: { color: colors.error, fontSize: fontSize.sm },
  section: { gap: spacing.sm },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primary + "20" },
  chipLabel: { color: colors.textMuted, fontSize: fontSize.xs, fontWeight: "600" },
  chipLabelActive: { color: colors.primary, fontWeight: "700" },
  challengeCard: { gap: spacing.sm },
  challengeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  challengeTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: "700",
    flex: 1,
  },
  prompt: { color: colors.text, fontSize: fontSize.sm, lineHeight: 20 },
  constraints: {
    backgroundColor: colors.surface2,
    borderRadius: radius.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 2,
  },
  constraintsLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: "600",
    marginBottom: spacing.xs,
  },
  constraintsLine: { color: colors.text, fontSize: fontSize.xs, fontFamily: "monospace" },
  langRow: { flexDirection: "row", gap: spacing.xs, flexWrap: "wrap" },
  langBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  langBtnActive: { borderColor: colors.primary, backgroundColor: colors.primary + "20" },
  langLabel: { color: colors.textMuted, fontSize: fontSize.xs, fontWeight: "600" },
  langLabelActive: { color: colors.primary },
  transcript: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    color: colors.text,
    fontSize: fontSize.sm,
    minHeight: 120,
    textAlignVertical: "top",
  },
  reportCard: { gap: spacing.sm },
  scoreRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.xs },
  scoreValue: { color: colors.text, fontSize: fontSize.xxxl, fontWeight: "800" },
  scoreOutOf: { color: colors.textMuted, fontSize: fontSize.md, fontWeight: "600" },
  reportFeedback: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 20 },
  listCard: { gap: spacing.xs },
  listLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: spacing.xs,
  },
  listLine: { color: colors.text, fontSize: fontSize.sm, lineHeight: 20 },
});

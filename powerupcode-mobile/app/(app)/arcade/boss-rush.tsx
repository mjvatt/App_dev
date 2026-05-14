import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
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

const TOTAL_LIVES = 3;
const REVIVE_COST = 5;
const EXTRA_LIFE_COST = 7;

type Language = "python" | "javascript" | "typescript" | "java";
const LANGUAGES: Language[] = ["python", "javascript", "typescript", "java"];

interface Challenge {
  id: string;
  topic: string;
  difficulty: string;
  title: string;
  prompt: string;
  constraints: string[];
  examples: { input?: string; output?: string }[];
}

interface RunState {
  id: string;
  status: "in_progress" | "completed" | "wiped";
  current_index: number;
  lives_remaining: number;
  attempts_total: number;
  xp_awarded: number | null;
  current_challenge: Challenge | null;
}

interface AttemptResult {
  passed: boolean;
  feedback: string;
  status: RunState["status"];
  current_index: number;
  lives_remaining: number;
  attempts_total: number;
  xp_awarded: number | null;
  next_challenge: Challenge | null;
}

interface ProgressSnapshot {
  token_balance: number;
}

export default function BossRushScreen() {
  const [run, setRun] = useState<RunState | null>(null);
  const [language, setLanguage] = useState<Language>("python");
  const [code, setCode] = useState("");
  const [lastResult, setLastResult] = useState<AttemptResult | null>(null);
  const [tokens, setTokens] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [spendingAction, setSpendingAction] = useState<null | "revive" | "extra-life">(null);
  const [error, setError] = useState("");

  const fetchTokens = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const data = await authedRequest<ProgressSnapshot>("/api/progress/me", token);
      setTokens(data.token_balance);
    } catch {
      // Non-fatal: spend buttons just won't render until the next refresh.
    }
  }, []);

  const startRun = useCallback(async () => {
    setError("");
    setLastResult(null);
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const data = await authedRequest<RunState>(
        "/api/boss-rush/start",
        token,
        { method: "POST", body: JSON.stringify({}) },
      );
      setRun(data);
      setCode("");
      await fetchTokens();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start a run.");
    } finally {
      setLoading(false);
    }
  }, [fetchTokens]);

  useEffect(() => { startRun(); }, [startRun]);

  // Reset the editor when the active problem changes so a stale solution
  // doesn't leak from the previous boss into the next one.
  useEffect(() => {
    setCode("");
  }, [run?.current_challenge?.id]);

  async function handleSubmit() {
    if (!run || !run.current_challenge || !code.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const token = await getToken();
      if (!token) return;
      const data = await authedRequest<AttemptResult>(
        `/api/boss-rush/${run.id}/attempt`,
        token,
        {
          method: "POST",
          body: JSON.stringify({ solution: code, time_ms: 0 }),
        },
      );
      setLastResult(data);
      setRun({
        id: run.id,
        status: data.status,
        current_index: data.current_index,
        lives_remaining: data.lives_remaining,
        attempts_total: data.attempts_total,
        xp_awarded: data.xp_awarded,
        current_challenge: data.next_challenge ?? (data.status === "in_progress" ? run.current_challenge : null),
      });
      await fetchTokens();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSpend(action: "revive" | "extra-life") {
    if (!run) return;
    setSpendingAction(action);
    setError("");
    try {
      const token = await getToken();
      if (!token) return;
      const data = await authedRequest<RunState>(
        `/api/boss-rush/${run.id}/${action}`,
        token,
        { method: "POST", body: JSON.stringify({}) },
      );
      setRun(data);
      setLastResult(null);
      await fetchTokens();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("402")) {
        setError("Not enough power-up tokens for that.");
      } else {
        setError(msg || "Action failed.");
      }
    } finally {
      setSpendingAction(null);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.screenTitle}>Boss Rush</Text>
          <View style={styles.headerMeta}>
            <Lives remaining={run?.lives_remaining ?? TOTAL_LIVES} />
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

        {run?.status === "wiped" && (
          <Card style={styles.terminalCard}>
            <Text style={styles.terminalHeadline}>Wipe</Text>
            <Text style={styles.terminalBody}>
              You burned through all three lives. The run is over — unless you
              spend tokens to bring it back.
            </Text>
            <View style={styles.terminalActions}>
              {tokens !== null && tokens >= REVIVE_COST && (
                <Button
                  label={`Revive · ${REVIVE_COST} ⚡`}
                  onPress={() => handleSpend("revive")}
                  loading={spendingAction === "revive"}
                />
              )}
              <Button
                label="Back to Arcade"
                onPress={() => router.push("/(app)/arcade")}
                variant="secondary"
              />
            </View>
          </Card>
        )}

        {run?.status === "completed" && (
          <Card style={styles.terminalCard}>
            <Text style={styles.terminalHeadline}>Boss Rush complete</Text>
            <Text style={styles.terminalBody}>
              You cleared all three boss problems.
            </Text>
            {run.xp_awarded !== null && (
              <Text style={styles.xpAwarded}>+{run.xp_awarded} XP</Text>
            )}
            <View style={styles.terminalActions}>
              <Button label="Run it back" onPress={startRun} />
              <Button
                label="Back to Arcade"
                onPress={() => router.push("/(app)/arcade")}
                variant="secondary"
              />
            </View>
          </Card>
        )}

        {run?.status === "in_progress" && run.current_challenge && (
          <>
            <Card style={styles.challengeCard}>
              <View style={styles.challengeHeader}>
                <Text style={styles.challengeTitle}>
                  {run.current_challenge.title}
                </Text>
                <TierBadge difficulty={"boss" as TierDifficulty} size="sm" />
              </View>
              <Text style={styles.progressText}>
                Problem {run.current_index + 1} of 3
              </Text>
              <Text style={styles.prompt}>{run.current_challenge.prompt}</Text>
              {run.current_challenge.constraints.length > 0 && (
                <View style={styles.constraints}>
                  <Text style={styles.constraintsLabel}>Constraints</Text>
                  {run.current_challenge.constraints.map((c, i) => (
                    <Text key={i} style={styles.constraintsLine}>· {c}</Text>
                  ))}
                </View>
              )}
            </Card>

            {lastResult && !lastResult.passed && (
              <Card style={[styles.resultCard, styles.resultFail]}>
                <Text style={styles.resultHeadline}>Wrong answer</Text>
                <Text style={styles.resultFeedback}>{lastResult.feedback}</Text>
              </Card>
            )}

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
              height={300}
            />

            <Button
              label={submitting ? "Submitting…" : "Submit"}
              onPress={handleSubmit}
              loading={submitting}
              fullWidth
            />

            {run.lives_remaining < TOTAL_LIVES &&
              tokens !== null &&
              tokens >= EXTRA_LIFE_COST && (
                <Button
                  label={`+1 Life · ${EXTRA_LIFE_COST} ⚡`}
                  onPress={() => handleSpend("extra-life")}
                  loading={spendingAction === "extra-life"}
                  variant="secondary"
                />
              )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Lives({ remaining }: { remaining: number }) {
  const slots = Array.from({ length: TOTAL_LIVES }, (_, i) => i < remaining);
  return (
    <View style={styles.livesRow}>
      {slots.map((alive, i) => (
        <MaterialCommunityIcons
          key={i}
          name={alive ? "heart" : "heart-outline"}
          size={18}
          color={alive ? colors.error : colors.textDim}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  screenTitle: { color: colors.text, fontSize: fontSize.xxl, fontWeight: "800" },
  headerMeta: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  livesRow: { flexDirection: "row", gap: 2 },
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
  progressText: { color: colors.textMuted, fontSize: fontSize.xs, letterSpacing: 0.5 },
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
  resultCard: { gap: spacing.sm },
  resultFail: { borderColor: colors.error + "60", backgroundColor: "#1a0000" },
  resultHeadline: { color: colors.text, fontSize: fontSize.md, fontWeight: "700" },
  resultFeedback: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 20 },
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
  terminalCard: { gap: spacing.sm },
  terminalHeadline: { color: colors.text, fontSize: fontSize.xl, fontWeight: "800" },
  terminalBody: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 20 },
  xpAwarded: { color: colors.xp, fontSize: fontSize.lg, fontWeight: "700" },
  terminalActions: { gap: spacing.sm, marginTop: spacing.xs },
});

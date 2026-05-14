import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { authedRequest } from "@/lib/api";
import { getToken } from "@/lib/auth";
import MonacoEditor from "@/components/game/MonacoEditor";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { colors, fontSize, spacing, radius } from "@/lib/theme";

type Mode = "quick" | "daily" | "review";

const MODE_TITLES: Record<Mode, string> = {
  quick: "Quick Play",
  daily: "Daily Challenge",
  review: "Review",
};

function resolveMode(raw: string | string[] | undefined): Mode {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === "daily" || value === "review") return value;
  return "quick";
}

interface DailyEnvelope {
  challenge: Challenge;
  status?: unknown;
}

interface Challenge {
  id: number;
  title: string;
  topic: string;
  difficulty: string;
  description: string;
  examples: string;
  starter_code: Record<string, string>;
}

interface AttemptResult {
  passed: boolean;
  xp_earned: number;
  tokens_earned?: number;
  feedback: string;
  time_ms?: number;
}

type Difficulty = "auto" | "easy" | "medium" | "hard" | "boss";
type Language = "python" | "javascript" | "typescript" | "java";

const DIFFICULTIES: Difficulty[] = ["auto", "easy", "medium", "hard", "boss"];
const LANGUAGES: Language[] = ["python", "javascript", "typescript", "java"];

const DIFFICULTY_COLORS: Record<Difficulty, string> = {
  auto: colors.difficulty.auto,
  easy: colors.difficulty.easy,
  medium: colors.difficulty.medium,
  hard: colors.difficulty.hard,
  boss: colors.difficulty.boss,
};

export default function ArcadeScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const mode = useMemo(() => resolveMode(params.mode), [params.mode]);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>("auto");
  const [language, setLanguage] = useState<Language>("python");
  const [code, setCode] = useState("");
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [emptyReview, setEmptyReview] = useState(false);

  const fetchChallenge = useCallback(async (diff: Difficulty) => {
    setResult(null);
    setError("");
    setEmptyReview(false);
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      let data: Challenge;
      if (mode === "daily") {
        const envelope = await authedRequest<DailyEnvelope>(
          "/api/challenges/daily",
          token,
        );
        data = envelope.challenge;
      } else if (mode === "review") {
        data = await authedRequest<Challenge>("/api/challenges/review", token);
      } else {
        data = await authedRequest<Challenge>(
          `/api/challenges/next?difficulty=${diff}`,
          token,
        );
      }
      setChallenge(data);
      setCode(data.starter_code?.[language] ?? "");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "";
      if (mode === "review" && message.includes("404")) {
        setEmptyReview(true);
        setChallenge(null);
      } else if (message.includes("402")) {
        setError("Upgrade to premium to unlock this difficulty.");
      } else {
        setError(message || "Failed to load challenge.");
      }
    } finally {
      setLoading(false);
    }
  }, [language, mode]);

  useEffect(() => { fetchChallenge(difficulty); }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleDifficultyChange(diff: Difficulty) {
    setDifficulty(diff);
    fetchChallenge(diff);
  }

  function handleLanguageChange(lang: Language) {
    setLanguage(lang);
    if (challenge?.starter_code?.[lang]) {
      setCode(challenge.starter_code[lang]);
    }
  }

  async function handleSubmit() {
    if (!challenge || !code.trim()) return;
    setSubmitting(true);
    setResult(null);
    try {
      const token = await getToken();
      if (!token) return;
      const data = await authedRequest<AttemptResult>(
        `/api/challenges/${challenge.id}/attempt`,
        token,
        { method: "POST", body: JSON.stringify({ code, language, difficulty }) },
      );
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.screenTitle}>{MODE_TITLES[mode]}</Text>

        {mode === "quick" && (
          <View style={styles.diffRow}>
            {DIFFICULTIES.map((d) => (
              <TouchableOpacity
                key={d}
                onPress={() => handleDifficultyChange(d)}
                style={[
                  styles.diffBtn,
                  { borderColor: DIFFICULTY_COLORS[d] },
                  difficulty === d ? { backgroundColor: DIFFICULTY_COLORS[d] + "20" } : null,
                ]}
              >
                <Text
                  style={[
                    styles.diffLabel,
                    { color: DIFFICULTY_COLORS[d] },
                    difficulty === d ? styles.diffLabelActive : null,
                  ]}
                >
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {emptyReview && !loading && (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyHeadline}>No reviews due</Text>
            <Text style={styles.emptyBody}>
              Nothing on your spaced-repetition queue is due yet. Come back later
              or run a fresh Quick Play attempt.
            </Text>
            <Button
              label="Back to Arcade"
              onPress={() => router.push("/(app)/arcade")}
              variant="secondary"
            />
          </Card>
        )}

        {loading && (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        )}

        {!!error && !loading && (
          <Card style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
            <Button label="Retry" onPress={() => fetchChallenge(difficulty)} variant="ghost" />
          </Card>
        )}

        {challenge && !loading && (
          <>
            <Card style={styles.challengeCard}>
              <View style={styles.challengeHeader}>
                <Text style={styles.challengeTitle}>{challenge.title}</Text>
                <View style={[styles.badge, { backgroundColor: DIFFICULTY_COLORS[challenge.difficulty as Difficulty] + "25" }]}>
                  <Text style={[styles.badgeText, { color: DIFFICULTY_COLORS[challenge.difficulty as Difficulty] }]}>
                    {challenge.difficulty.toUpperCase()}
                  </Text>
                </View>
              </View>
              <Text style={styles.topic}>{challenge.topic.replace(/_/g, " ")}</Text>
              <Text style={styles.description}>{challenge.description}</Text>
              {!!challenge.examples && (
                <View style={styles.examples}>
                  <Text style={styles.examplesLabel}>Examples</Text>
                  <Text style={styles.examplesText}>{challenge.examples}</Text>
                </View>
              )}
            </Card>

            <View style={styles.langRow}>
              {LANGUAGES.map((l) => (
                <TouchableOpacity
                  key={l}
                  onPress={() => handleLanguageChange(l)}
                  style={[styles.langBtn, language === l ? styles.langBtnActive : null]}
                >
                  <Text style={[styles.langLabel, language === l ? styles.langLabelActive : null]}>
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

            {result && (
              <Card style={[styles.resultCard, result.passed ? styles.resultPass : styles.resultFail]}>
                <Text style={styles.resultHeadline}>
                  {result.passed ? "Passed" : "Failed"}
                </Text>
                <View style={styles.rewardRow}>
                  {result.xp_earned > 0 && (
                    <Text style={styles.xpEarned}>+{result.xp_earned} XP</Text>
                  )}
                  {!!result.tokens_earned && result.tokens_earned > 0 && (
                    <View style={styles.tokenChip}>
                      <MaterialCommunityIcons
                        name="lightning-bolt"
                        size={14}
                        color={colors.warning}
                      />
                      <Text style={styles.tokenChipText}>
                        +{result.tokens_earned}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.resultFeedback}>{result.feedback}</Text>
                {mode !== "daily" && (
                  <Button
                    label="Next challenge"
                    onPress={() => fetchChallenge(difficulty)}
                    variant="secondary"
                    style={{ marginTop: spacing.sm }}
                  />
                )}
                {mode === "daily" && (
                  <Button
                    label="Back to Arcade"
                    onPress={() => router.push("/(app)/arcade")}
                    variant="secondary"
                    style={{ marginTop: spacing.sm }}
                  />
                )}
              </Card>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  screenTitle: { color: colors.text, fontSize: fontSize.xxl, fontWeight: "800" },
  centered: { paddingVertical: spacing.xxl, alignItems: "center" },
  diffRow: { flexDirection: "row", gap: spacing.xs, flexWrap: "wrap" },
  diffBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  diffLabel: { fontSize: fontSize.xs, fontWeight: "600", color: colors.textMuted },
  diffLabelActive: { fontWeight: "700" },
  errorCard: { borderColor: colors.error, backgroundColor: "#1a0000", gap: spacing.sm },
  errorText: { color: colors.error, fontSize: fontSize.sm },
  challengeCard: { gap: spacing.sm },
  challengeHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  challengeTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: "700", flex: 1, marginRight: spacing.sm },
  badge: { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  badgeText: { fontSize: fontSize.xs, fontWeight: "700" },
  topic: { color: colors.textMuted, fontSize: fontSize.xs, textTransform: "uppercase", letterSpacing: 1 },
  description: { color: colors.text, fontSize: fontSize.sm, lineHeight: 20 },
  examples: {
    backgroundColor: colors.surface2,
    borderRadius: radius.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  examplesLabel: { color: colors.textMuted, fontSize: fontSize.xs, fontWeight: "600", marginBottom: spacing.xs },
  examplesText: { color: colors.text, fontSize: fontSize.xs, fontFamily: "monospace" },
  langRow: { flexDirection: "row", gap: spacing.xs },
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
  resultCard: { gap: spacing.sm },
  resultPass: { borderColor: colors.success + "60", backgroundColor: "#001a08" },
  resultFail: { borderColor: colors.error + "60", backgroundColor: "#1a0000" },
  resultHeadline: { color: colors.text, fontSize: fontSize.lg, fontWeight: "700" },
  rewardRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  xpEarned: { color: colors.xp, fontSize: fontSize.md, fontWeight: "600" },
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
  emptyCard: { gap: spacing.sm, alignItems: "flex-start" },
  emptyHeadline: { color: colors.text, fontSize: fontSize.lg, fontWeight: "700" },
  emptyBody: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 20 },
  resultFeedback: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 20 },
});

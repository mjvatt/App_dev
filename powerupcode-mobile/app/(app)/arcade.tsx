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
import { authedRequest } from "@/lib/api";
import { getToken } from "@/lib/auth";
import MonacoEditor from "@/components/game/MonacoEditor";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { colors, fontSize, spacing, radius } from "@/lib/theme";

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
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>("auto");
  const [language, setLanguage] = useState<Language>("python");
  const [code, setCode] = useState("");
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchChallenge = useCallback(async (diff: Difficulty) => {
    setResult(null);
    setError("");
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const data = await authedRequest<Challenge>(
        `/api/challenges/next?difficulty=${diff}`,
        token,
      );
      setChallenge(data);
      setCode(data.starter_code?.[language] ?? "");
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("402")) {
        setError("Upgrade to premium to unlock this difficulty.");
      } else {
        setError(err instanceof Error ? err.message : "Failed to load challenge.");
      }
    } finally {
      setLoading(false);
    }
  }, [language]);

  useEffect(() => { fetchChallenge(difficulty); }, []);

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
        <Text style={styles.screenTitle}>Arcade</Text>

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
                {result.xp_earned > 0 && (
                  <Text style={styles.xpEarned}>+{result.xp_earned} XP</Text>
                )}
                <Text style={styles.resultFeedback}>{result.feedback}</Text>
                <Button
                  label="Next challenge"
                  onPress={() => fetchChallenge(difficulty)}
                  variant="secondary"
                  style={{ marginTop: spacing.sm }}
                />
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
  xpEarned: { color: colors.xp, fontSize: fontSize.md, fontWeight: "600" },
  resultFeedback: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 20 },
});

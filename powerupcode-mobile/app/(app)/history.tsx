import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { authedRequest } from "@/lib/api";
import { getToken } from "@/lib/auth";
import Card from "@/components/ui/Card";
import TierBadge from "@/components/game/TierBadge";
import { Difficulty, colors, fontSize, spacing, radius } from "@/lib/theme";

interface Attempt {
  id: number;
  challenge_title: string;
  topic: string;
  difficulty: string;
  passed: boolean;
  xp_earned: number;
  time_ms: number | null;
  created_at: string;
}

const TIER_DIFFICULTIES: ReadonlySet<Difficulty> = new Set<Difficulty>([
  "easy",
  "medium",
  "hard",
  "boss",
]);

function asTierDifficulty(raw: string): Difficulty | null {
  return TIER_DIFFICULTIES.has(raw as Difficulty) ? (raw as Difficulty) : null;
}

export default function HistoryScreen() {
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchHistory = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const data = await authedRequest<Attempt[]>("/api/attempts", token);
      setAttempts(data);
    } catch {
      setError("Failed to load history.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  function formatDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function formatTime(ms: number | null) {
    if (!ms) return null;
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
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
      <FlatList
        data={attempts}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={fetchHistory} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          <Text style={styles.screenTitle}>History</Text>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {error || "No attempts yet. Head to Arcade to get started."}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Card style={styles.row}>
            <View style={styles.rowTop}>
              <Text style={styles.challengeTitle} numberOfLines={1}>
                {item.challenge_title}
              </Text>
              <Text style={[styles.passedBadge, item.passed ? styles.passed : styles.failed]}>
                {item.passed ? "PASS" : "FAIL"}
              </Text>
            </View>
            <View style={styles.rowMeta}>
              <Text style={styles.meta}>{item.topic.replace(/_/g, " ")}</Text>
              {asTierDifficulty(item.difficulty) ? (
                <TierBadge difficulty={asTierDifficulty(item.difficulty)!} size="sm" />
              ) : (
                <Text style={styles.meta}>{item.difficulty}</Text>
              )}
              {item.xp_earned > 0 && (
                <Text style={[styles.meta, { color: colors.xp }]}>+{item.xp_earned} XP</Text>
              )}
              {formatTime(item.time_ms) && (
                <Text style={styles.meta}>{formatTime(item.time_ms)}</Text>
              )}
              <Text style={styles.meta}>{formatDate(item.created_at)}</Text>
            </View>
          </Card>
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  container: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xxl },
  screenTitle: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: "800",
    marginBottom: spacing.sm,
  },
  row: { gap: spacing.xs },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  challengeTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: "600", flex: 1, marginRight: spacing.sm },
  passedBadge: { fontSize: fontSize.xs, fontWeight: "700", paddingHorizontal: spacing.xs, paddingVertical: 2, borderRadius: radius.sm },
  passed: { color: colors.success, backgroundColor: colors.success + "20" },
  failed: { color: colors.error, backgroundColor: colors.error + "20" },
  rowMeta: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  meta: { color: colors.textMuted, fontSize: fontSize.xs },
  separator: { height: spacing.sm },
  empty: { paddingVertical: spacing.xl, alignItems: "center" },
  emptyText: { color: colors.textMuted, fontSize: fontSize.sm, textAlign: "center" },
});

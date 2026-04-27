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
import { colors, fontSize, spacing, radius } from "@/lib/theme";

interface LeaderboardEntry {
  rank: number;
  username: string;
  xp: number;
  level: number;
  streak: number;
  is_current_user?: boolean;
}

export default function LeaderboardScreen() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchLeaderboard = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const data = await authedRequest<LeaderboardEntry[]>("/api/leaderboard", token);
      setEntries(data);
    } catch {
      setError("Failed to load leaderboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLeaderboard(); }, [fetchLeaderboard]);

  function rankColor(rank: number) {
    if (rank === 1) return "#ffd700";
    if (rank === 2) return "#c0c0c0";
    if (rank === 3) return "#cd7f32";
    return colors.textDim;
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
        data={entries}
        keyExtractor={(item) => String(item.rank)}
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={fetchLeaderboard} tintColor={colors.primary} />
        }
        ListHeaderComponent={<Text style={styles.screenTitle}>Leaderboard</Text>}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{error || "No entries yet."}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.row, item.is_current_user && styles.currentUser]}>
            <Text style={[styles.rank, { color: rankColor(item.rank) }]}>
              #{item.rank}
            </Text>
            <View style={styles.info}>
              <Text style={[styles.username, item.is_current_user && styles.currentUserText]}>
                {item.username}
                {item.is_current_user ? " (you)" : ""}
              </Text>
              <Text style={styles.sub}>
                Lv {item.level} · {item.streak}d streak
              </Text>
            </View>
            <Text style={styles.xp}>{item.xp.toLocaleString()} XP</Text>
          </View>
        )}
        ItemSeparatorComponent={() => <View style={styles.divider} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  container: { padding: spacing.md, paddingBottom: spacing.xxl },
  screenTitle: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: "800",
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  currentUser: { backgroundColor: colors.primary + "15", borderWidth: 1, borderColor: colors.primary + "40" },
  rank: { width: 36, fontSize: fontSize.md, fontWeight: "700", textAlign: "center" },
  info: { flex: 1 },
  username: { color: colors.text, fontSize: fontSize.md, fontWeight: "600" },
  currentUserText: { color: colors.primary },
  sub: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  xp: { color: colors.xp, fontSize: fontSize.sm, fontWeight: "700" },
  divider: { height: 1, backgroundColor: colors.border, marginHorizontal: spacing.sm },
  empty: { paddingVertical: spacing.xl, alignItems: "center" },
  emptyText: { color: colors.textMuted, fontSize: fontSize.sm },
});

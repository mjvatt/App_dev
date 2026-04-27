import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { authedRequest } from "@/lib/api";
import { getToken, clearToken } from "@/lib/auth";
import XPBar from "@/components/game/XPBar";
import Card from "@/components/ui/Card";
import { colors, fontSize, spacing, radius } from "@/lib/theme";

interface ProgressData {
  xp: number;
  level: number;
  streak: number;
  topics: Record<string, number>;
}

interface MeData {
  username: string;
  is_verified: boolean;
}

const TOPIC_LABELS: Record<string, string> = {
  arrays: "Arrays",
  strings: "Strings",
  linked_lists: "Linked Lists",
  trees: "Trees",
  graphs: "Graphs",
  dynamic_programming: "DP",
  system_design: "System Design",
};

export default function DashboardScreen() {
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [me, setMe] = useState<MeData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) { router.replace("/(auth)/login"); return; }
      const [progressData, meData] = await Promise.all([
        authedRequest<ProgressData>("/api/progress/me", token),
        authedRequest<MeData>("/api/auth/me", token),
      ]);
      setProgress(progressData);
      setMe(meData);
    } catch {
      setError("Failed to load dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleLogout() {
    await clearToken();
    router.replace("/(auth)/login");
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} tintColor={colors.primary} />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>
              {me ? `Hey, ${me.username}` : "Dashboard"}
            </Text>
            <Text style={styles.greetingSub}>Keep grinding.</Text>
          </View>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
            <Text style={styles.logoutText}>Sign out</Text>
          </TouchableOpacity>
        </View>

        {!me?.is_verified && (
          <Card style={styles.verifyBanner}>
            <Text style={styles.verifyText}>
              Verify your email to unlock all features.
            </Text>
          </Card>
        )}

        {!!error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={fetchData} style={styles.retryBtn}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {progress && (
          <>
            <Card style={styles.statsCard}>
              <XPBar xp={progress.xp} level={progress.level} />
              <View style={styles.statRow}>
                <StatPill label="Level" value={String(progress.level)} color={colors.xp} />
                <StatPill label="Streak" value={`${progress.streak}d`} color={colors.warning} />
                <StatPill label="XP" value={String(progress.xp)} color={colors.primary} />
              </View>
            </Card>

            <Text style={styles.sectionTitle}>Topics</Text>
            <View style={styles.topicsGrid}>
              {Object.entries(TOPIC_LABELS).map(([key, label]) => {
                const solved = progress.topics?.[key] ?? 0;
                return (
                  <Card key={key} style={styles.topicCell}>
                    <Text style={styles.topicLabel}>{label}</Text>
                    <Text style={styles.topicCount}>{solved}</Text>
                    <Text style={styles.topicSub}>solved</Text>
                  </Card>
                );
              })}
            </View>

            <TouchableOpacity
              style={styles.arcadeBtn}
              onPress={() => router.push("/(app)/arcade")}
              activeOpacity={0.8}
            >
              <Text style={styles.arcadeBtnText}>Go to Arcade</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={[statStyles.pill, { borderColor: color + "40" }]}>
      <Text style={[statStyles.value, { color }]}>{value}</Text>
      <Text style={statStyles.label}>{label}</Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  pill: {
    flex: 1,
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
  },
  value: { fontSize: fontSize.xl, fontWeight: "800" },
  label: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  greeting: { color: colors.text, fontSize: fontSize.xxl, fontWeight: "800" },
  greetingSub: { color: colors.textMuted, fontSize: fontSize.sm },
  logoutBtn: { paddingVertical: spacing.xs },
  logoutText: { color: colors.textMuted, fontSize: fontSize.sm },
  verifyBanner: {
    borderColor: colors.warning,
    backgroundColor: "#1a1200",
  },
  verifyText: { color: colors.warning, fontSize: fontSize.sm },
  errorBox: {
    backgroundColor: "#3f0000",
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.error,
    gap: spacing.sm,
  },
  errorText: { color: colors.error, fontSize: fontSize.sm },
  retryBtn: { alignSelf: "flex-start" },
  retryText: { color: colors.primary, fontSize: fontSize.sm, fontWeight: "600" },
  statsCard: { gap: spacing.md },
  statRow: { flexDirection: "row", gap: spacing.sm },
  sectionTitle: { color: colors.textMuted, fontSize: fontSize.sm, fontWeight: "600", letterSpacing: 1 },
  topicsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  topicCell: {
    width: "47%",
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  topicLabel: { color: colors.textMuted, fontSize: fontSize.xs, fontWeight: "600" },
  topicCount: { color: colors.text, fontSize: fontSize.xxl, fontWeight: "800", marginTop: spacing.xs },
  topicSub: { color: colors.textDim, fontSize: fontSize.xs },
  arcadeBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  arcadeBtnText: { color: "#fff", fontWeight: "700", fontSize: fontSize.md },
});

import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Card from "@/components/ui/Card";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

interface Mode {
  key: string;
  title: string;
  description: string;
  icon: IconName;
  route: `/${string}` | null;
}

const MODES: Mode[] = [
  {
    key: "quick-play",
    title: "Quick Play",
    description: "Adaptive single problem with a live timer and personal-best chase.",
    icon: "lightning-bolt",
    route: "/(app)/arcade/play",
  },
  {
    key: "daily",
    title: "Daily Challenge",
    description: "One problem for everyone today. Ranked by time.",
    icon: "calendar-today",
    route: "/(app)/arcade/play?mode=daily",
  },
  {
    key: "review",
    title: "Review",
    description: "Spaced-repetition queue of cards coming due.",
    icon: "book-open-page-variant",
    route: "/(app)/arcade/play?mode=review",
  },
  {
    key: "boss-rush",
    title: "Boss Rush",
    description: "Three boss-tier problems back-to-back. Three lives.",
    icon: "sword-cross",
    route: null,
  },
  {
    key: "mock-interview",
    title: "Mock Interview",
    description: "Multi-stage timed session with AI-graded post-mortem.",
    icon: "microphone",
    route: null,
  },
];

export default function ArcadeHubScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.screenTitle}>Arcade</Text>
          <Text style={styles.subtitle}>Pick a game mode</Text>
        </View>

        <View style={styles.modeList}>
          {MODES.map((mode) => {
            const enabled = mode.route !== null;
            return (
              <TouchableOpacity
                key={mode.key}
                disabled={!enabled}
                activeOpacity={enabled ? 0.7 : 1}
                onPress={() => {
                  if (mode.route) router.push(mode.route);
                }}
              >
                <Card style={[styles.modeCard, !enabled && styles.modeCardDisabled]}>
                  <View
                    style={[
                      styles.iconWell,
                      !enabled && styles.iconWellDisabled,
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={mode.icon}
                      size={26}
                      color={enabled ? colors.primary : colors.textDim}
                    />
                  </View>
                  <View style={styles.modeBody}>
                    <View style={styles.modeTitleRow}>
                      <Text
                        style={[
                          styles.modeTitle,
                          !enabled && styles.modeTitleDisabled,
                        ]}
                      >
                        {mode.title}
                      </Text>
                      {!enabled && (
                        <View style={styles.comingPill}>
                          <Text style={styles.comingPillText}>Coming soon</Text>
                        </View>
                      )}
                    </View>
                    <Text
                      style={[
                        styles.modeDescription,
                        !enabled && styles.modeDescriptionDisabled,
                      ]}
                    >
                      {mode.description}
                    </Text>
                  </View>
                </Card>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: {
    padding: spacing.md,
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  header: { gap: spacing.xs },
  screenTitle: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: "800",
  },
  subtitle: { color: colors.textMuted, fontSize: fontSize.sm },
  modeList: { gap: spacing.sm },
  modeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  modeCardDisabled: { opacity: 0.55 },
  iconWell: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWellDisabled: { borderColor: colors.border },
  modeBody: { flex: 1, gap: spacing.xs },
  modeTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  modeTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: "700",
  },
  modeTitleDisabled: { color: colors.textMuted },
  modeDescription: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    lineHeight: 18,
  },
  modeDescriptionDisabled: { color: colors.textDim },
  comingPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    backgroundColor: colors.surface2,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  comingPillText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
});

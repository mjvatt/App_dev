import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, fontSize, spacing, radius } from "@/lib/theme";

function xpForLevel(level: number): number {
  return level * 100;
}

interface XPBarProps {
  xp: number;
  level: number;
}

export default function XPBar({ xp, level }: XPBarProps) {
  const threshold = xpForLevel(level);
  const prev = xpForLevel(level - 1);
  const progress = Math.min((xp - prev) / (threshold - prev), 1);

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.label}>Level {level}</Text>
        <Text style={styles.xpText}>
          {xp} / {threshold} XP
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${progress * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: { color: colors.xp, fontWeight: "700", fontSize: fontSize.sm },
  xpText: { color: colors.textMuted, fontSize: fontSize.xs },
  track: {
    height: 8,
    backgroundColor: colors.surface2,
    borderRadius: radius.full,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    backgroundColor: colors.xp,
    borderRadius: radius.full,
  },
});

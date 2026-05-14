import React, { ComponentProps } from "react";
import { View, Text, StyleSheet } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
  Difficulty,
  fontSize,
  radius,
  spacing,
  tierThemes,
} from "@/lib/theme";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

type Size = "sm" | "md" | "lg";

interface SizeStyle {
  paddingHorizontal: number;
  paddingVertical: number;
  fontSize: number;
  iconSize: number;
  gap: number;
}

const SIZES: Record<Size, SizeStyle> = {
  sm: {
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
    fontSize: fontSize.xs,
    iconSize: 12,
    gap: spacing.xs,
  },
  md: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    fontSize: fontSize.sm,
    iconSize: 14,
    gap: spacing.xs,
  },
  lg: {
    paddingHorizontal: spacing.md - 4,
    paddingVertical: 6,
    fontSize: fontSize.md,
    iconSize: 16,
    gap: spacing.xs + 2,
  },
};

interface Props {
  difficulty: Difficulty;
  size?: Size;
  showWorld?: boolean;
}

export default function TierBadge({
  difficulty,
  size = "md",
  showWorld = false,
}: Props) {
  const theme = tierThemes[difficulty];
  const sizing = SIZES[size];
  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          paddingHorizontal: sizing.paddingHorizontal,
          paddingVertical: sizing.paddingVertical,
          gap: sizing.gap,
        },
      ]}
    >
      <MaterialCommunityIcons
        name={theme.icon as IconName}
        size={sizing.iconSize}
        color={theme.text}
      />
      <Text style={[styles.label, { color: theme.text, fontSize: sizing.fontSize }]}>
        {showWorld ? theme.world : theme.label}
      </Text>
    </View>
  );
}

export function tierWorld(difficulty: Difficulty): string {
  return tierThemes[difficulty].world;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: radius.full,
  },
  label: {
    fontWeight: "600",
  },
});

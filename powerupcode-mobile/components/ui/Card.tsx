import React from "react";
import { View, StyleSheet, StyleProp, ViewStyle } from "react-native";
import { colors, radius, spacing } from "@/lib/theme";

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  elevated?: boolean;
}

export default function Card({ children, style, elevated = false }: CardProps) {
  return (
    <View style={[styles.card, elevated ? styles.elevated : null, style]}>{children}</View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  elevated: {
    backgroundColor: colors.surface2,
  },
});

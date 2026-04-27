export const colors = {
  bg: "#000000",
  surface: "#0f0f0f",
  surface2: "#1a1a1a",
  border: "#2a2a2a",
  text: "#ffffff",
  textMuted: "#888888",
  textDim: "#555555",
  primary: "#6366f1",
  primaryDim: "#4338ca",
  success: "#22c55e",
  error: "#ef4444",
  warning: "#f59e0b",
  xp: "#a855f7",
  difficulty: {
    easy: "#22c55e",
    medium: "#eab308",
    hard: "#f97316",
    boss: "#dc2626",
    auto: "#6366f1",
  },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  full: 9999,
} as const;

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 18,
  xl: 22,
  xxl: 28,
  xxxl: 36,
} as const;

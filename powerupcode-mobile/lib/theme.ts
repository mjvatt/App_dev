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

export type Difficulty = "easy" | "medium" | "hard" | "boss";

export interface TierTheme {
  label: string;
  world: string;
  surface: string;
  border: string;
  text: string;
  // MaterialCommunityIcons name. Kept as a string here so this module
  // stays free of @expo/vector-icons imports; the TierBadge component
  // is responsible for rendering the actual glyph.
  icon: string;
}

export const tierThemes: Record<Difficulty, TierTheme> = {
  easy: {
    label: "Easy",
    world: "Forest",
    surface: "rgba(6, 78, 59, 0.6)",
    border: "#065f46",
    text: "#6ee7b7",
    icon: "pine-tree",
  },
  medium: {
    label: "Medium",
    world: "Cavern",
    surface: "rgba(12, 74, 110, 0.6)",
    border: "#0369a1",
    text: "#7dd3fc",
    icon: "diamond-stone",
  },
  hard: {
    label: "Hard",
    world: "Volcano",
    surface: "rgba(67, 20, 7, 0.6)",
    border: "#9a3412",
    text: "#fdba74",
    icon: "fire",
  },
  boss: {
    label: "Boss",
    world: "Boss Lair",
    surface: "rgba(69, 10, 10, 0.6)",
    border: "#991b1b",
    text: "#fca5a5",
    icon: "skull",
  },
};

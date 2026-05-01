import type { Difficulty } from "@/lib/types";

interface TierTheme {
  label: string;
  // Tailwind utility groups for the badge surface and ring.
  surface: string;
  text: string;
  // SVG path data for a small thematic icon. Stylized — no emoji.
  icon: React.ReactNode;
  // Single-word "world" label that hints at the difficulty's vibe.
  world: string;
}

const THEMES: Record<Difficulty, TierTheme> = {
  easy: {
    label: "Easy",
    surface: "bg-emerald-950/60 border-emerald-800",
    text: "text-emerald-300",
    world: "Forest",
    icon: (
      // Pine tree silhouette
      <path d="M12 2L7 11h3l-4 7h12l-4-7h3z" />
    ),
  },
  medium: {
    label: "Medium",
    surface: "bg-sky-950/60 border-sky-800",
    text: "text-sky-300",
    world: "Cavern",
    icon: (
      // Cave mouth — arch over baseline
      <path d="M3 21V12a9 9 0 0118 0v9h-5v-6a4 4 0 00-8 0v6z" />
    ),
  },
  hard: {
    label: "Hard",
    surface: "bg-orange-950/60 border-orange-800",
    text: "text-orange-300",
    world: "Volcano",
    icon: (
      // Triangular peak with a notched crater
      <path d="M3 20l6-13 3 5 2-3 7 11zM10 7l-1 2 2 1z" />
    ),
  },
  boss: {
    label: "Boss",
    surface: "bg-red-950/60 border-red-800",
    text: "text-red-300",
    world: "Boss Lair",
    icon: (
      // Skull-ish crown
      <path d="M12 2l3 4h4l-3 4 1 6-5-3-5 3 1-6-3-4h4z" />
    ),
  },
};

interface Props {
  difficulty: Difficulty;
  size?: "sm" | "md" | "lg";
  showWorld?: boolean;
}

const SIZES: Record<NonNullable<Props["size"]>, string> = {
  sm: "px-2 py-0.5 text-xs gap-1",
  md: "px-2.5 py-1 text-sm gap-1.5",
  lg: "px-3 py-1.5 text-base gap-2",
};

const ICON_SIZE: Record<NonNullable<Props["size"]>, string> = {
  sm: "h-3 w-3",
  md: "h-4 w-4",
  lg: "h-5 w-5",
};

export default function TierBadge({
  difficulty,
  size = "md",
  showWorld = false,
}: Props) {
  const theme = THEMES[difficulty];
  return (
    <span
      className={`inline-flex items-center font-semibold border rounded-full ${theme.surface} ${theme.text} ${SIZES[size]}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className={ICON_SIZE[size]}
        aria-hidden
      >
        {theme.icon}
      </svg>
      <span>{showWorld ? theme.world : theme.label}</span>
    </span>
  );
}

export function tierWorld(difficulty: Difficulty): string {
  return THEMES[difficulty].world;
}

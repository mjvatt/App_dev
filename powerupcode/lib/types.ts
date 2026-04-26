export type Topic =
  | "arrays"
  | "strings"
  | "linked_lists"
  | "trees"
  | "graphs"
  | "dynamic_programming"
  | "system_design";

export type Difficulty = "easy" | "medium" | "hard" | "boss";

export interface Challenge {
  id: string;
  topic: Topic;
  difficulty: Difficulty;
  title: string;
  prompt: string;
  constraints: string[];
  examples: Array<{ input: string; output: string }>;
}

export interface AttemptResult {
  attempt_id: string;
  passed: boolean;
  xp_earned: number;
  feedback: string;
  hints_used: number;
  time_ms: number;
}

export interface DifficultyStats {
  attempts: number;
  passed: number;
  pass_rate: number;
}

export interface UserProgress {
  user_id: string;
  total_xp: number;
  level: number;
  xp_to_next: number;
  streak_days: number;
  topics: Record<Topic, number>;
  difficulty_stats: Partial<Record<Difficulty, DifficultyStats>>;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface SubscriptionStatus {
  active: boolean;
  tier: string | null;
  status: string | null;
  current_period_end: string | null;
}

export interface UserMe {
  user_id: string;
  username: string;
  email: string;
  is_verified: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  level: number;
  total_xp: number;
  streak_days: number;
  is_current_user: boolean;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
}

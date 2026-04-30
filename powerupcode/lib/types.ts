import type { components } from "./api-types.generated";

// Source of truth for the cross-language enums lives in the FastAPI schema.
// Regenerate with `npm run codegen:api` after backend changes.
export type Topic = components["schemas"]["Topic"];
export type Difficulty = components["schemas"]["Difficulty"];

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
  leveled_up: boolean;
  new_level: number;
  streak_days: number;
  streak_milestone: number | null;
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

export interface DailyChallengeStatus {
  solved: boolean;
  time_ms: number | null;
  rank: number | null;
}

export interface DailyChallengeResponse {
  challenge: Challenge;
  status: DailyChallengeStatus;
}

export interface DailyLeaderboardEntry {
  rank: number;
  username: string;
  time_ms: number;
  is_current_user: boolean;
}

export interface DailyLeaderboardResponse {
  entries: DailyLeaderboardEntry[];
  total_solvers: number;
}

export interface CurriculumResponse {
  weak_topic: Topic;
  suggested_difficulty: Difficulty;
  rationale: string;
  pass_count: number;
  total_attempts: number;
}

export interface FriendUserSummary {
  user_id: string;
  username: string;
  level: number;
  total_xp: number;
  streak_days: number;
}

export interface FriendshipEntry {
  friendship_id: string;
  status: "pending" | "accepted";
  direction: "incoming" | "outgoing" | "mutual";
  other: FriendUserSummary;
  created_at: string;
}

export interface FriendsListResponse {
  friends: FriendshipEntry[];
}

export interface FriendRequestsResponse {
  incoming: FriendshipEntry[];
  outgoing: FriendshipEntry[];
}

export interface UserSearchEntry {
  user_id: string;
  username: string;
}

export interface UserSearchResponse {
  results: UserSearchEntry[];
}

export interface FriendLeaderboardEntry {
  rank: number;
  username: string;
  level: number;
  total_xp: number;
  streak_days: number;
  is_current_user: boolean;
}

export interface FriendLeaderboardResponse {
  entries: FriendLeaderboardEntry[];
}

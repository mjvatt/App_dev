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
  daily_streak_days: number;
  daily_streak_milestone: number | null;
  tokens_earned: number;
  streak_shields_consumed: number;
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
  daily_streak_days: number;
  token_balance: number;
  streak_shields: number;
  topics: Record<Topic, number>;
  difficulty_stats: Partial<Record<Difficulty, DifficultyStats>>;
}

export interface StreakShieldResponse {
  streak_shields: number;
  token_balance: number;
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

export interface InterviewSession {
  id: string;
  status: "in_progress" | "completed" | "abandoned";
  challenge: Challenge;
  topic: string | null;
  difficulty: string | null;
  started_at: string;
  ended_at: string | null;
  overall_score: number | null;
  feedback: string | null;
  strengths: string[];
  improvements: string[];
  time_ms: number | null;
  tokens_earned: number;
  time_freezes_used: number;
}

export interface InterviewHistoryEntry {
  id: string;
  status: "in_progress" | "completed" | "abandoned";
  challenge_id: string;
  challenge_title: string | null;
  topic: string | null;
  difficulty: string | null;
  overall_score: number | null;
  started_at: string;
  ended_at: string | null;
}

export interface InterviewHistoryResponse {
  items: InterviewHistoryEntry[];
}

export interface PersonalBest {
  best_time_ms: number | null;
  pass_count: number;
}

export interface BossRushSession {
  id: string;
  status: "in_progress" | "completed" | "wiped";
  current_index: number;
  lives_remaining: number;
  attempts_total: number;
  xp_awarded: number | null;
  current_challenge: Challenge | null;
  challenge_ids: string[];
  started_at: string;
  ended_at: string | null;
}

export interface BossRushAttemptResponse {
  passed: boolean;
  feedback: string;
  status: "in_progress" | "completed" | "wiped";
  current_index: number;
  lives_remaining: number;
  attempts_total: number;
  xp_awarded: number | null;
  next_challenge: Challenge | null;
}

export interface ExplanationGrade {
  correctness: number;
  clarity: number;
  completeness: number;
  communication: number;
  overall: number;
  feedback: string;
  available: boolean;
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

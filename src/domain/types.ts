export type Horizon = "daily" | "weekly" | "monthly" | "long-term";
export type QuestionStatus =
  | "DRAFT"
  | "PUBLISHED"
  | "CLOSED"
  | "RESOLVED"
  | "CANCELLED"
  | "VOID";
export type Category =
  | "Science & tech"
  | "Climate"
  | "World"
  | "Sports"
  | "Economy";
export interface Question {
  id: string;
  title: string;
  description: string;
  category: Category;
  horizon: Horizon;
  status: QuestionStatus;
  opensAt: string;
  closesAt: string;
  resolvesAt: string;
  resolutionCriteria: string;
  sourceName: string;
  sourceUrl: string;
  outcome: 0 | 1 | null;
  visual: "space" | "climate" | "ai" | "world" | "sports" | "economy";
  isDemo: boolean;
}
export interface Profile {
  id: string;
  username: string;
  country: string;
  avatarColor: string;
  isAdmin: boolean;
  isRegistered?: boolean;
}
export interface Forecast {
  id: string;
  questionId: string;
  userId: string;
  probability: number;
  reasoning: string;
  updatedAt: string;
  revisionCount: number;
}
export interface ForecastRevision {
  id: string;
  forecastId: string;
  questionId: string;
  userId: string;
  probability: number;
  reasoning: string;
  createdAt: string;
}
export interface Consensus {
  probability: number;
  participants: number;
  distribution: { label: string; count: number }[];
  history: { date: string; probability: number }[];
}
export interface QuestionView extends Question {
  forecast: Forecast | null;
  consensus: Consensus | null;
}
export interface LeaderboardEntry {
  userId: string;
  username: string;
  country: string;
  meanBrier: number;
  resolvedCount: number;
  points: number;
  rank: number;
}
export interface League {
  id: string;
  name: string;
  description: string;
  code: string;
  ownerId: string;
  memberCount: number;
  members: LeaderboardEntry[];
  period: "weekly" | "monthly";
}
export interface ProfileStats {
  resolvedCount: number;
  meanBrier: number | null;
  points: number;
  forecastCount: number;
  calibration: { probability: number; outcome: number; count: number }[];
  categories: { category: string; meanBrier: number; count: number }[];
}
export interface Bootstrap {
  mode: "demo" | "supabase";
  user: Profile | null;
  questions: QuestionView[];
  leagues: League[];
  leaderboard: LeaderboardEntry[];
  stats: ProfileStats;
}
export interface ApiError {
  error: string;
}

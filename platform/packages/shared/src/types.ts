// ============================================================
// Shared TS types — used by both backend (NestJS) and frontend.
// Keep small and platform-agnostic (no NestJS or Prisma imports).
// ============================================================

export type UserRole =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "SUPER_MASTER"
  | "MASTER"
  | "AGENT"
  | "USER";

export const ROLE_RANK: Record<UserRole, number> = {
  SUPER_ADMIN: 100,
  ADMIN: 80,
  SUPER_MASTER: 60,
  MASTER: 40,
  AGENT: 20,
  USER: 0,
};

export type BetSide = "BACK" | "LAY";
export type BetStatus = "OPEN" | "MATCHED" | "SETTLED" | "VOID" | "CANCELLED";

export type MarketType =
  | "MATCH_ODDS"
  | "BOOKMAKER"
  | "PREMIUM_BOOKMAKER"
  | "FANCY"
  | "SESSION"
  | "OVER_RUNS"
  | "PLAYER_RUNS"
  | "TEAM_TOTAL"
  | "FALL_OF_WICKET"
  | "BOUNDARIES"
  | "PARTNERSHIP"
  | "TIED_MATCH"
  | "TOSS"
  | "FIRST_INNINGS";

export type MarketStatus = "OPEN" | "SUSPENDED" | "CLOSED" | "SETTLED" | "VOID";

export type SportKey =
  | "cricket"
  | "football"
  | "tennis"
  | "basketball"
  | "table-tennis"
  | "horse-racing"
  | "greyhound"
  | "volleyball"
  | "snooker"
  | "darts";

export interface OddsTick {
  marketId: string;
  runnerId: string;
  back: number[]; // up to 3 levels of back odds (best first)
  lay: number[];  // up to 3 levels of lay odds (best first)
  backSize?: number[];
  laySize?: number[];
  ts: number;
}

export interface MarketSnapshot {
  marketId: string;
  matchId: string;
  type: MarketType;
  name: string;
  status: MarketStatus;
  minStake: number;
  maxStake: number;
  runners: Array<{ id: string; name: string }>;
}

export interface PlaceBetRequest {
  marketId: string;
  runnerId: string;
  side: BetSide;
  odds: number;
  stake: number;
  // For fancy markets, the "runs" prediction value (e.g. predicting 6-over runs)
  fancyValue?: number;
}

export interface PlaceBetResponse {
  betId: string;
  status: BetStatus;
  potentialProfit: number;
  potentialLiability: number;
  newBalance: number;
  newExposure: number;
}

export interface WalletSummary {
  balance: number;
  exposure: number;
  bonus: number;
  available: number; // balance - exposure
  currency: string;
}

// ============================================================
// WebSocket event names — keep in sync between client & server
// ============================================================
export const WS_EVENTS = {
  ODDS_TICK: "odds:tick",
  MARKET_STATUS: "market:status",
  WALLET_UPDATE: "wallet:update",
  EXPOSURE_UPDATE: "exposure:update",
  BET_SETTLED: "bet:settled",
  ANNOUNCEMENT: "announcement",
} as const;

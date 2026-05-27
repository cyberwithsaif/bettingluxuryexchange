// =============================================================
// Canonical VIP tiers — the SINGLE source of truth for VIP/levels.
// A user's level is derived purely from their total deposits
// (DEPOSIT + ADMIN_CREDIT). Web, admin and the API all read this.
// =============================================================

export type VipRank = "bronze" | "silver" | "gold" | "platinum" | "diamond" | "legend";

export const VIP_TIERS = [
  { name: "Bronze",   rank: "bronze"   as VipRank, min: 0,           max: 10_000,    color: "#d97706", grad: "linear-gradient(135deg, #92400e, #d97706)",                    cashback: 1,  perks: ["1% cashback", "Standard support", "Weekly bonus"] },
  { name: "Silver",   rank: "silver"   as VipRank, min: 10_000,      max: 50_000,    color: "#d1d5db", grad: "linear-gradient(135deg, #6b7280, #d1d5db)",                    cashback: 2,  perks: ["2% cashback", "Priority support", "Bi-weekly bonus", "Free spins"] },
  { name: "Gold",     rank: "gold"     as VipRank, min: 50_000,      max: 2_00_000,  color: "#fbbf24", grad: "linear-gradient(135deg, #b45309, #f59e0b, #fbbf24)",           cashback: 3,  perks: ["3% cashback", "Dedicated support", "Weekly bonus", "Higher limits"] },
  { name: "Platinum", rank: "platinum" as VipRank, min: 2_00_000,    max: 10_00_000, color: "#38bdf8", grad: "linear-gradient(135deg, #0369a1, #38bdf8)",                    cashback: 5,  perks: ["5% cashback", "Personal manager", "Daily bonus", "VIP events", "Exclusive games"] },
  { name: "Diamond",  rank: "diamond"  as VipRank, min: 10_00_000,   max: 50_00_000, color: "#a78bfa", grad: "linear-gradient(135deg, #6d28d9, #a78bfa, #e879f9)",           cashback: 8,  perks: ["8% cashback", "Dedicated manager", "Custom bonuses", "Private tables", "Luxury rewards"] },
  { name: "Legend",   rank: "legend"   as VipRank, min: 50_00_000,   max: Infinity,  color: "#f43f5e", grad: "linear-gradient(135deg, #9f1239, #e11d48, #fb7185, #fda4af)", cashback: 12, perks: ["12% cashback", "Elite personal manager", "Daily luxury bonus", "Exclusive tournaments", "Private VIP events", "Custom rewards"] },
] as const;

export type VipTier = (typeof VIP_TIERS)[number];

/** Index of the tier a deposit total falls into (0 = Bronze). */
export function getTierIndex(totalDeposited: number): number {
  for (let i = VIP_TIERS.length - 1; i >= 0; i--) {
    if (totalDeposited >= VIP_TIERS[i]!.min) return i;
  }
  return 0;
}

export function getTierFromDeposits(totalDeposited: number): VipTier {
  return VIP_TIERS[getTierIndex(totalDeposited)]!;
}

/** Compact level descriptor used by APIs/badges: 1-based tier number + display bits. */
export function levelFromDeposits(totalDeposited: number) {
  const idx = getTierIndex(totalDeposited);
  const t = VIP_TIERS[idx]!;
  return { name: t.name, tier: idx + 1, color: t.color, cashback: t.cashback, min: t.min, max: t.max, perks: t.perks as readonly string[] };
}

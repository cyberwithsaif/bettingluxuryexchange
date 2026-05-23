export type VipRank = "bronze" | "silver" | "gold" | "platinum" | "diamond" | "legend";

export const VIP_TIERS = [
  {
    name: "Bronze" as const,
    rank: "bronze" as VipRank,
    min: 0,
    max: 10_000,
    color: "#d97706",
    grad: "linear-gradient(135deg, #92400e, #d97706)",
    cashback: 1,
    perks: ["1% cashback", "Standard support", "Weekly bonus"],
  },
  {
    name: "Silver" as const,
    rank: "silver" as VipRank,
    min: 10_000,
    max: 50_000,
    color: "#d1d5db",
    grad: "linear-gradient(135deg, #6b7280, #d1d5db)",
    cashback: 2,
    perks: ["2% cashback", "Priority support", "Bi-weekly bonus", "Free spins"],
  },
  {
    name: "Gold" as const,
    rank: "gold" as VipRank,
    min: 50_000,
    max: 2_00_000,
    color: "#fbbf24",
    grad: "linear-gradient(135deg, #b45309, #f59e0b, #fbbf24)",
    cashback: 3,
    perks: ["3% cashback", "Dedicated support", "Weekly bonus", "Higher limits"],
  },
  {
    name: "Platinum" as const,
    rank: "platinum" as VipRank,
    min: 2_00_000,
    max: 10_00_000,
    color: "#38bdf8",
    grad: "linear-gradient(135deg, #0369a1, #38bdf8)",
    cashback: 5,
    perks: ["5% cashback", "Personal manager", "Daily bonus", "VIP events", "Exclusive games"],
  },
  {
    name: "Diamond" as const,
    rank: "diamond" as VipRank,
    min: 10_00_000,
    max: 50_00_000,
    color: "#a78bfa",
    grad: "linear-gradient(135deg, #6d28d9, #a78bfa, #e879f9)",
    cashback: 8,
    perks: ["8% cashback", "Dedicated manager", "Custom bonuses", "Private tables", "Luxury rewards"],
  },
  {
    name: "Legend" as const,
    rank: "legend" as VipRank,
    min: 50_00_000,
    max: Infinity,
    color: "#f43f5e",
    grad: "linear-gradient(135deg, #9f1239, #e11d48, #fb7185, #fda4af)",
    cashback: 12,
    perks: ["12% cashback", "Elite personal manager", "Daily luxury bonus", "Exclusive tournaments", "Private VIP events", "Custom rewards"],
  },
] as const;

export type VipTier = (typeof VIP_TIERS)[number];

export function getTierIndex(totalDeposited: number): number {
  for (let i = VIP_TIERS.length - 1; i >= 0; i--) {
    if (totalDeposited >= VIP_TIERS[i]!.min) return i;
  }
  return 0;
}

export function getTierFromDeposits(totalDeposited: number): VipTier {
  return VIP_TIERS[getTierIndex(totalDeposited)]!;
}

/** @deprecated Use /wallet/total-deposited endpoint instead */
export function calcTotalDeposited(ledgerItems: { kind: string; amount: string | number }[]): number {
  return ledgerItems
    .filter((e) => e.kind === "DEPOSIT" || e.kind === "ADMIN_CREDIT")
    .reduce((s, e) => s + Math.abs(Number(e.amount)), 0);
}

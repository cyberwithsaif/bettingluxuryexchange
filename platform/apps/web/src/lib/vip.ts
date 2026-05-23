export type VipRank = "bronze" | "silver" | "gold" | "platinum" | "diamond";

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
    max: Infinity,
    color: "#a78bfa",
    grad: "linear-gradient(135deg, #6d28d9, #a78bfa, #e879f9)",
    cashback: 8,
    perks: ["8% cashback", "Dedicated manager", "Custom bonuses", "Private tables", "Luxury rewards"],
  },
] as const;

export type VipTier = (typeof VIP_TIERS)[number];

export function getTierIndex(totalDeposited: number): number {
  const idx = VIP_TIERS.findIndex((t, i) => {
    const next = VIP_TIERS[i + 1];
    return totalDeposited >= t.min && (!next || totalDeposited < next.min);
  });
  return Math.max(0, idx);
}

export function getTierFromDeposits(totalDeposited: number): VipTier {
  return VIP_TIERS[getTierIndex(totalDeposited)]!;
}

export function calcTotalDeposited(ledgerItems: { kind: string; amount: string | number }[]): number {
  return ledgerItems
    .filter((e) => e.kind === "DEPOSIT")
    .reduce((s, e) => s + Math.abs(Number(e.amount)), 0);
}

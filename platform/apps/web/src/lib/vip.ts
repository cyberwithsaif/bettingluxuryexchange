// VIP tiers now live in @exch/shared (single source of truth for web + admin + API).
export { VIP_TIERS, getTierIndex, getTierFromDeposits, levelFromDeposits } from "@exch/shared";
export type { VipRank, VipTier } from "@exch/shared";

/** @deprecated Use /wallet/total-deposited endpoint instead */
export function calcTotalDeposited(ledgerItems: { kind: string; amount: string | number }[]): number {
  return ledgerItems
    .filter((e) => e.kind === "DEPOSIT" || e.kind === "ADMIN_CREDIT")
    .reduce((s, e) => s + Math.abs(Number(e.amount)), 0);
}

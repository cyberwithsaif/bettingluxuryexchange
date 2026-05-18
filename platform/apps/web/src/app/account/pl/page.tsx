"use client";
import useSWR from "swr";

export default function ProfitLossPage() {
  const { data: bets } = useSWR("/bets/mine?status=SETTLED_WON");
  const { data: lost } = useSWR("/bets/mine?status=SETTLED_LOST");
  const won = (bets ?? []).reduce((s: number, b: any) => s + Number(b.potentialProfit), 0);
  const lost_ = (lost ?? []).reduce((s: number, b: any) => s + Number(b.liability), 0);
  const net = won - lost_;
  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl">Profit / Loss</h1>
      <div className="grid grid-cols-3 gap-3">
        <Card label="Total won"  value={won}  tone="ok" />
        <Card label="Total lost" value={lost_} tone="bad" />
        <Card label="Net"        value={net}  tone={net >= 0 ? "ok" : "bad"} />
      </div>
      <p className="text-xs text-white/40">P/L shown for currently-loaded bet history. Use account statement for full ledger.</p>
    </div>
  );
}

function Card({ label, value, tone }: { label: string; value: number; tone: "ok" | "bad" }) {
  return (
    <div className="glass rounded-xl p-4">
      <p className="text-[10px] uppercase tracking-wider text-white/50">{label}</p>
      <p className={`font-display text-3xl mt-1 ${tone === "ok" ? "text-ok" : "text-bad"}`}>
        {(value >= 0 ? "+" : "") + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value)}
      </p>
    </div>
  );
}

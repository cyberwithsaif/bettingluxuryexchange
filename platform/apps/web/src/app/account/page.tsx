"use client";
import useSWR from "swr";
import { useAuthStore } from "@/lib/stores/auth";
import Link from "next/link";

export default function AccountDashboard() {
  const user = useAuthStore((s) => s.user);
  const { data: wallet } = useSWR(user ? "/wallet/summary" : null);
  const { data: bets } = useSWR(user ? "/bets/mine?status=OPEN" : null);

  if (!user) return <p className="glass rounded-xl p-6">Please <Link className="text-accentSoft" href="/auth/login">sign in</Link>.</p>;

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl">Hey, {user.username}</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label="Available" value={fmt(wallet?.available)} accent />
        <Card label="Balance"   value={fmt(wallet?.balance)} />
        <Card label="Exposure"  value={fmt(wallet?.exposure)} bad />
        <Card label="Bonus"     value={fmt(wallet?.bonus)} />
      </div>

      <section className="glass rounded-xl p-4">
        <h2 className="font-display text-xl mb-3">Open bets</h2>
        {(!bets || bets.length === 0)
          ? <p className="text-white/60 text-sm">No open bets.</p>
          : <ul className="divide-y divide-line/40 text-sm">
              {bets.slice(0, 5).map((b: any) => (
                <li key={b.id} className="py-2 flex items-center justify-between">
                  <div><div className="font-semibold">{b.market.match.name}</div><div className="text-xs text-white/50">{b.runner.name} · {b.side}</div></div>
                  <div className="text-right text-xs tabular-nums">
                    <div>{Number(b.stake).toLocaleString("en-IN")} @ {Number(b.odds).toFixed(2)}</div>
                    <div className="text-white/50">Liability: {fmt(Number(b.liability))}</div>
                  </div>
                </li>
              ))}
            </ul>
        }
      </section>
    </div>
  );
}

function fmt(n: number | undefined) { return n == null ? "—" : new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n); }

function Card({ label, value, accent, bad }: { label: string; value: string; accent?: boolean; bad?: boolean }) {
  return (
    <div className="glass rounded-xl p-4">
      <p className="text-[10px] uppercase tracking-wider text-white/50">{label}</p>
      <p className={"font-display text-3xl mt-1 " + (accent ? "text-accent" : bad ? "text-bad" : "text-white")}>{value}</p>
    </div>
  );
}

// trigger rebuild

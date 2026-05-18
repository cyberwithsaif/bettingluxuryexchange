"use client";
import { useState } from "react";
import { X, Send } from "lucide-react";
import { useBetslip } from "@/lib/stores/betslip";
import { useAuthStore } from "@/lib/stores/auth";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { mutate as swrMutate } from "swr";

const QUICK_STAKES = [100, 500, 1000, 2500, 5000, 10000, 25000, 50000];

export function Betslip() {
  const { selections, remove, update, clear } = useBetslip();
  const user = useAuthStore((s) => s.user);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const total = selections.reduce((s, sel) => s + (sel.stake || 0), 0);

  async function placeAll() {
    if (!user) { window.location.href = "/auth/login"; return; }
    setError(null);
    for (const s of selections) {
      if (!s.stake || s.stake <= 0) continue;
      setSubmitting(s.runnerId + s.side);
      try {
        await api.post("/bets", {
          marketId: s.marketId,
          runnerId: s.runnerId,
          side: s.side,
          odds: s.odds,
          stake: s.stake,
        });
        remove(s.runnerId, s.side);
      } catch (e: any) {
        setError(e?.response?.data?.message || "Bet failed");
        break;
      } finally {
        setSubmitting(null);
      }
    }
    swrMutate("/wallet/summary");
    swrMutate(`/bets/mine`);
  }

  return (
    <aside className="glass rounded-xl overflow-hidden">
      <header className="px-4 py-3 border-b border-line bg-betslip-grad flex items-center justify-between">
        <h2 className="font-display text-xl tracking-wide">Betslip</h2>
        {selections.length > 0 && (
          <button onClick={clear} className="text-xs text-white/60 hover:text-bad">Clear all</button>
        )}
      </header>

      {selections.length === 0 ? (
        <div className="p-6 text-center text-sm text-white/60">
          Tap any odds to start your slip.
        </div>
      ) : (
        <ul className="divide-y divide-line/40 max-h-[60vh] overflow-y-auto">
          {selections.map((s) => (
            <li key={s.runnerId + s.side} className="p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-white/50 truncate">{s.matchName}</p>
                  <p className="font-semibold truncate">
                    {s.runnerName}{" "}
                    <span className={cn("text-xs font-bold ml-1", s.side === "BACK" ? "text-back" : "text-lay")}>
                      {s.side}
                    </span>
                  </p>
                </div>
                <button
                  onClick={() => remove(s.runnerId, s.side)}
                  className="text-white/40 hover:text-bad"
                ><X size={16}/></button>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className={cn(
                  "rounded-md px-2 py-1.5 text-center text-sm font-bold",
                  s.side === "BACK" ? "bg-back text-ink" : "bg-lay text-ink",
                )}>
                  {s.odds.toFixed(2)}
                </div>
                <input
                  inputMode="decimal"
                  value={s.stake || ""}
                  onChange={(e) => update(s.runnerId, s.side, { stake: Number(e.target.value) || 0 })}
                  placeholder="Stake"
                  className="bg-ink border border-line rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-accent tabular-nums"
                />
              </div>

              <div className="mt-2 grid grid-cols-4 gap-1">
                {QUICK_STAKES.slice(0, 4).map((amt) => (
                  <button
                    key={amt}
                    onClick={() => update(s.runnerId, s.side, { stake: amt })}
                    className="text-[11px] font-semibold rounded bg-panel2 border border-line py-1 hover:border-accent"
                  >
                    {amt.toLocaleString("en-IN")}
                  </button>
                ))}
              </div>

              <p className="mt-1.5 text-xs text-white/50">
                Potential {s.side === "BACK" ? "profit" : "liability"}:{" "}
                <span className="text-accentSoft font-semibold">
                  {fmt((s.stake || 0) * (s.side === "BACK" ? (s.odds - 1) : (s.odds - 1)))}
                </span>
              </p>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <div className="mx-3 mb-3 text-xs text-bad bg-bad/15 border border-bad/40 rounded px-2 py-1.5">
          {error}
        </div>
      )}

      {selections.length > 0 && (
        <footer className="p-3 border-t border-line bg-betslip-grad">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-white/60">Total stake</span>
            <span className="font-bold tabular-nums">{fmt(total)}</span>
          </div>
          <button
            onClick={placeAll}
            disabled={!!submitting || total <= 0}
            className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-accent-grad py-2.5 font-bold text-ink shadow-glow hover:brightness-110 disabled:opacity-50"
          >
            <Send size={14}/> {submitting ? "Placing…" : "Place bets"}
          </button>
        </footer>
      )}
    </aside>
  );
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);
}

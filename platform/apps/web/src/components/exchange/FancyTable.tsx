"use client";
import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { useBetslip } from "@/lib/stores/betslip";
import type { BetSide } from "@exch/shared";

interface Runner {
  id: string;
  name: string;
  fancyBack?: number | null;
  fancyLay?: number | null;
  backPrices?: number[] | null;
  layPrices?: number[] | null;
}

interface Market {
  id: string;
  name: string;
  type: string;
  status: string;
  minStake: string;
  maxStake: string;
  runners: Runner[];
}

interface FancyCellProps {
  value: number | null | undefined;
  side: "NO" | "YES";
  flashKey?: number;
  onClick?: () => void;
  disabled?: boolean;
}

function FancyCell({ value, side, onClick, disabled, flashKey }: FancyCellProps) {
  const prev = useRef<number | null>(value ?? null);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    const curr = value ?? null;
    if (curr !== null && prev.current !== null && curr !== prev.current) {
      setFlash(curr > prev.current ? "up" : "down");
      const id = setTimeout(() => setFlash(null), 700);
      prev.current = curr;
      return () => clearTimeout(id);
    }
    prev.current = curr;
  }, [value, flashKey]);

  const empty = value == null || value <= 0;

  return (
    <button
      type="button"
      disabled={disabled || empty}
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border text-sm font-bold tabular-nums transition-all w-full h-14 gap-0.5",
        side === "NO"
          ? "bg-lay/90 border-lay/60 text-ink hover:brightness-110 hover:shadow-[0_0_12px_rgba(250,82,82,0.5)]"
          : "bg-back/90 border-back/60 text-ink hover:brightness-110 hover:shadow-[0_0_12px_rgba(56,189,248,0.5)]",
        empty && "opacity-40 cursor-not-allowed bg-panel2 border-line text-white/40",
        flash === "up" && "animate-flashUp",
        flash === "down" && "animate-flashDown",
      )}
    >
      <span className="text-base leading-none">{empty ? "—" : value}</span>
      <span className="text-[9px] uppercase tracking-widest opacity-70">{side}</span>
    </button>
  );
}

export function FancyTable({ market, matchName }: { market: Market; matchName: string }) {
  const add = useBetslip((s) => s.add);
  const suspended = market.status === "SUSPENDED";

  const select = (runner: Runner, side: BetSide, odds: number) => {
    add({
      marketId: market.id,
      marketName: market.name,
      matchName,
      runnerId: runner.id,
      runnerName: runner.name,
      side,
      odds,
      stake: 0,
      fancyValue: side === "BACK" ? (runner.fancyBack ?? undefined) : (runner.fancyLay ?? undefined),
    });
  };

  return (
    <div className="glass rounded-xl overflow-hidden mb-4">
      {/* Header */}
      <div className="px-4 py-3 border-b border-line/60 bg-panel/40 flex items-center justify-between">
        <div>
          <h2 className="font-semibold">{market.name}</h2>
          <p className="text-[11px] text-white/45 mt-0.5">
            Min: ₹{Number(market.minStake).toLocaleString("en-IN")} &nbsp;·&nbsp; Max: ₹{Number(market.maxStake).toLocaleString("en-IN")}
          </p>
        </div>
        {suspended && (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-bad/20 text-bad border border-bad/40">
            Suspended
          </span>
        )}
      </div>

      {/* Column Labels */}
      <div className="grid grid-cols-[1fr_108px_108px] text-[10px] uppercase tracking-wider text-white/40 px-4 py-2 bg-panel/30 border-b border-line/40">
        <span>Market</span>
        <span className="text-center text-lay">No (Lay)</span>
        <span className="text-center text-back">Yes (Back)</span>
      </div>

      {/* Rows */}
      <div className={cn("relative divide-y divide-line/30", suspended && "pointer-events-none")}>
        {suspended && (
          <div className="absolute inset-0 z-10 bg-ink/70 backdrop-blur-sm grid place-items-center">
            <span className="px-4 py-2 rounded-md bg-bad/20 border border-bad/50 text-bad font-bold text-sm tracking-wider">
              MARKET SUSPENDED
            </span>
          </div>
        )}

        {market.runners.length === 0 && (
          <div className="px-4 py-8 text-center text-white/50 text-sm">No runners available.</div>
        )}

        {market.runners.map((runner) => {
          // Fancy markets store run-line as fancyBack / fancyLay.
          // Fallback: use first entry from backPrices/layPrices.
          const noVal = runner.fancyLay ?? runner.layPrices?.[0] ?? null;
          const yesVal = runner.fancyBack ?? runner.backPrices?.[0] ?? null;

          return (
            <div
              key={runner.id}
              className="grid grid-cols-[1fr_108px_108px] items-center gap-3 px-4 py-3 hover:bg-panel2/20 transition"
            >
              <div>
                <p className="font-semibold text-sm leading-tight">{runner.name}</p>
                {(noVal != null || yesVal != null) && (
                  <p className="text-[11px] text-white/40 mt-0.5">
                    Run line: {noVal ?? "—"} / {yesVal ?? "—"}
                  </p>
                )}
              </div>

              <FancyCell
                value={noVal}
                side="NO"
                onClick={() => noVal && select(runner, "LAY", noVal)}
              />
              <FancyCell
                value={yesVal}
                side="YES"
                onClick={() => yesVal && select(runner, "BACK", yesVal)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

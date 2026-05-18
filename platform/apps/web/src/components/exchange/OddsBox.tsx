"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { BetSide } from "@exch/shared";

interface Props {
  side: BetSide;
  odds: number;
  /** tier 0 = best, tier 1 = next available. Best price highlighted. */
  tier: 0 | 1;
  onClick?: () => void;
  disabled?: boolean;
}

/**
 * Sportsbook-style odds button.
 * Flashes green/red briefly when the underlying price changes — uses a
 * keyframe class, applied via useEffect when `odds` mutates.
 */
export function OddsBox({ side, odds, tier, onClick, disabled }: Props) {
  const prev = useRef<number>(odds);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    if (prev.current !== odds) {
      setFlash(odds > prev.current ? "up" : "down");
      const id = setTimeout(() => setFlash(null), 700);
      prev.current = odds;
      return () => clearTimeout(id);
    }
  }, [odds]);

  const empty = !odds || odds <= 1;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || empty}
      className={cn(
        "h-9 rounded-md text-center text-sm font-bold tabular-nums transition border",
        side === "BACK"
          ? tier === 0
            ? "bg-back text-ink border-back/80 hover:brightness-110"
            : "bg-backSoft text-ink/70 border-back/40"
          : tier === 0
            ? "bg-lay text-ink border-lay/80 hover:brightness-110"
            : "bg-laySoft text-ink/70 border-lay/40",
        empty && "opacity-40 cursor-not-allowed",
        flash === "up" && "animate-flashUp",
        flash === "down" && "animate-flashDown",
      )}
    >
      {empty ? "—" : odds.toFixed(2)}
    </button>
  );
}

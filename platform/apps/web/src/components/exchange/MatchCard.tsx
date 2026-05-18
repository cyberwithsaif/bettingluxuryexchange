"use client";
import { OddsBox } from "./OddsBox";
import { useBetslip } from "@/lib/stores/betslip";
import type { BetSide } from "@exch/shared";
import { Clock, Tv } from "lucide-react";

interface Props {
  match: {
    id: string;
    name: string;
    homeTeam: string;
    awayTeam: string;
    startTime: string;
    status: string;
    inplay: boolean;
    sport: { name: string };
    competition?: { name: string };
    markets: Array<{
      id: string;
      name: string;
      status: string;
      runners: Array<{
        id: string; name: string;
        backPrices: number[] | null;
        layPrices: number[] | null;
      }>;
    }>;
  };
}

export function MatchCard({ match }: Props) {
  const add = useBetslip((s) => s.add);
  const matchOdds = match.markets.find((m) => m.name.toLowerCase().includes("match"))
                 ?? match.markets[0];

  const select = (side: BetSide, runnerId: string, runnerName: string, odds: number, marketId: string, marketName: string) => {
    add({
      marketId, marketName,
      matchName: match.name, runnerId, runnerName, side, odds, stake: 0,
    });
  };

  const date = new Date(match.startTime);
  return (
    <article className="glass rounded-xl overflow-hidden">
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-line/70 bg-panel/40">
        <div className="flex items-center gap-3 min-w-0">
          {match.inplay && (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-bad text-white animate-pulseGlow">Live</span>
          )}
          <div className="min-w-0">
            <h3 className="font-semibold truncate">{match.name}</h3>
            <p className="text-xs text-white/50 truncate">
              {match.competition?.name ?? match.sport.name}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-white/60 shrink-0">
          <span className="inline-flex items-center gap-1"><Clock size={12}/>{date.toLocaleString("en-IN", { hour12: false })}</span>
          <span className="inline-flex items-center gap-1 text-accentSoft"><Tv size={12}/>Stream</span>
        </div>
      </header>

      {matchOdds && (
        <div>
          <div className="hidden sm:grid grid-cols-[1fr_repeat(2,72px)_repeat(2,72px)] text-[10px] uppercase tracking-wider text-white/40 px-4 py-1.5 bg-panel/40 border-b border-line/40">
            <span></span>
            <span className="text-center text-back col-span-2">Back</span>
            <span className="text-center text-lay col-span-2">Lay</span>
          </div>
          {matchOdds.runners.map((r) => (
            <div key={r.id} className="grid grid-cols-[1fr_repeat(2,72px)_repeat(2,72px)] items-center gap-1 px-4 py-2 border-b border-line/30 last:border-0 hover:bg-panel2/30">
              <span className="font-semibold truncate pr-2">{r.name}</span>
              <OddsBox
                side="BACK" tier={1} odds={r.backPrices?.[1] ?? 0}
                onClick={() => r.backPrices?.[1] && select("BACK", r.id, r.name, r.backPrices[1], matchOdds.id, matchOdds.name)}
              />
              <OddsBox
                side="BACK" tier={0} odds={r.backPrices?.[0] ?? 0}
                onClick={() => r.backPrices?.[0] && select("BACK", r.id, r.name, r.backPrices[0], matchOdds.id, matchOdds.name)}
              />
              <OddsBox
                side="LAY" tier={0} odds={r.layPrices?.[0] ?? 0}
                onClick={() => r.layPrices?.[0] && select("LAY", r.id, r.name, r.layPrices[0], matchOdds.id, matchOdds.name)}
              />
              <OddsBox
                side="LAY" tier={1} odds={r.layPrices?.[1] ?? 0}
                onClick={() => r.layPrices?.[1] && select("LAY", r.id, r.name, r.layPrices[1], matchOdds.id, matchOdds.name)}
              />
            </div>
          ))}
          {matchOdds.status === "SUSPENDED" && (
            <div className="px-4 py-2 text-xs text-bad bg-bad/10 border-t border-bad/30">Market suspended</div>
          )}
        </div>
      )}
    </article>
  );
}

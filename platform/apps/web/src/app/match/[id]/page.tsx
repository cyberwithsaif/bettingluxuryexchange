"use client";

import useSWR from "swr";
import { useState } from "react";
import { useParams } from "next/navigation";
import { Clock, Radio, ChevronLeft, TrendingUp } from "lucide-react";
import Link from "next/link";
import { OddsBox } from "@/components/exchange/OddsBox";
import { FancyTable } from "@/components/exchange/FancyTable";
import { Betslip } from "@/components/exchange/Betslip";
import { useBetslip } from "@/lib/stores/betslip";
import { useAuthStore } from "@/lib/stores/auth";
import { cn } from "@/lib/cn";
import type { BetSide } from "@exch/shared";

interface Runner {
  id: string;
  name: string;
  backPrices: number[] | null;
  layPrices: number[] | null;
  fancyBack?: number;
  fancyLay?: number;
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

interface Match {
  id: string;
  name: string;
  homeTeam: string;
  awayTeam: string;
  startTime: string;
  status: string;
  inplay: boolean;
  sport: { name: string };
  competition?: { name: string };
  markets: Market[];
}

const MARKET_TYPE_ORDER = ["MATCH_ODDS", "BOOKMAKER", "TOSS", "TIED_MATCH", "FANCY", "SESSION"];

function getMarketLabel(type: string) {
  switch (type) {
    case "MATCH_ODDS": return "Match Odds";
    case "BOOKMAKER": return "Bookmaker";
    case "TOSS": return "Toss";
    case "FANCY": return "Fancy";
    case "SESSION": return "Session";
    case "TIED_MATCH": return "Tied Match";
    default: return type;
  }
}

function isFancyLike(type: string) {
  return type === "FANCY" || type === "SESSION";
}

function fmt(n: number | string | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(n));
}

function MatchHeader({ match }: { match: Match }) {
  const date = new Date(match.startTime);
  return (
    <div className="glass rounded-xl p-5 mb-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/exchange" className="text-white/50 hover:text-accent transition">
            <ChevronLeft size={20} />
          </Link>
          <div>
            <div className="flex items-center gap-2 mb-1">
              {match.inplay && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-bad text-white animate-pulseGlow">
                  <Radio size={10} /> Live
                </span>
              )}
              {match.competition?.name && (
                <span className="text-xs text-white/50">{match.competition.name}</span>
              )}
              <span className="text-xs text-white/40">{match.sport.name}</span>
            </div>
            <h1 className="font-display text-2xl md:text-3xl leading-tight">{match.name}</h1>
            <div className="flex items-center gap-4 mt-1.5 text-sm text-white/60">
              <span className="text-lg font-bold text-white">{match.homeTeam}</span>
              <span className="text-white/30">vs</span>
              <span className="text-lg font-bold text-white">{match.awayTeam}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-white/50 shrink-0">
          <Clock size={12} />
          <span>{date.toLocaleString("en-IN", { hour12: false, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
        </div>
      </div>
    </div>
  );
}

function BackLayMarket({ market, matchName }: { market: Market; matchName: string }) {
  const add = useBetslip((s) => s.add);

  const select = (side: BetSide, runner: Runner, odds: number) => {
    add({
      marketId: market.id,
      marketName: market.name,
      matchName,
      runnerId: runner.id,
      runnerName: runner.name,
      side,
      odds,
      stake: 0,
    });
  };

  const suspended = market.status === "SUSPENDED";

  return (
    <div className="glass rounded-xl overflow-hidden mb-4">
      <div className="px-4 py-3 border-b border-line/60 bg-panel/40 flex items-center justify-between">
        <div>
          <h2 className="font-semibold">{market.name}</h2>
          <p className="text-[11px] text-white/45 mt-0.5">
            Min: ₹{fmt(market.minStake)} &nbsp;·&nbsp; Max: ₹{fmt(market.maxStake)}
          </p>
        </div>
        {suspended && (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-bad/20 text-bad border border-bad/40">
            Suspended
          </span>
        )}
      </div>

      <div className="hidden sm:grid grid-cols-[1fr_repeat(2,80px)_repeat(2,80px)] text-[10px] uppercase tracking-wider text-white/40 px-4 py-2 bg-panel/30 border-b border-line/40">
        <span></span>
        <span className="text-center text-back col-span-2">Back</span>
        <span className="text-center text-lay col-span-2">Lay</span>
      </div>

      <div className={cn("relative", suspended && "pointer-events-none")}>
        {suspended && (
          <div className="absolute inset-0 z-10 bg-ink/70 backdrop-blur-sm grid place-items-center">
            <span className="px-4 py-2 rounded-md bg-bad/20 border border-bad/50 text-bad font-bold text-sm tracking-wider">
              MARKET SUSPENDED
            </span>
          </div>
        )}
        {market.runners.map((r) => (
          <div
            key={r.id}
            className="grid grid-cols-[1fr_repeat(2,80px)_repeat(2,80px)] items-center gap-1.5 px-4 py-2.5 border-b border-line/30 last:border-0 hover:bg-panel2/20 transition"
          >
            <span className="font-semibold pr-2">{r.name}</span>
            <OddsBox
              side="BACK" tier={1} odds={r.backPrices?.[1] ?? 0}
              onClick={() => r.backPrices?.[1] && select("BACK", r, r.backPrices[1])}
            />
            <OddsBox
              side="BACK" tier={0} odds={r.backPrices?.[0] ?? 0}
              onClick={() => r.backPrices?.[0] && select("BACK", r, r.backPrices[0])}
            />
            <OddsBox
              side="LAY" tier={0} odds={r.layPrices?.[0] ?? 0}
              onClick={() => r.layPrices?.[0] && select("LAY", r, r.layPrices[0])}
            />
            <OddsBox
              side="LAY" tier={1} odds={r.layPrices?.[1] ?? 0}
              onClick={() => r.layPrices?.[1] && select("LAY", r, r.layPrices[1])}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MatchPage() {
  const params = useParams<{ id: string }>();
  const { data: match, error } = useSWR<Match>(params?.id ? `/markets/match/${params.id}` : null, { refreshInterval: 6000 });
  const user = useAuthStore((s) => s.user);

  const allTypes = match
    ? [...new Set(match.markets.map((m) => m.type))]
        .sort((a, b) => MARKET_TYPE_ORDER.indexOf(a) - MARKET_TYPE_ORDER.indexOf(b))
    : [];

  const [activeType, setActiveType] = useState<string>("");
  const currentType = activeType || allTypes[0] || "";

  const visibleMarkets = match?.markets.filter((m) => m.type === currentType) ?? [];

  if (error) {
    return (
      <div className="mx-auto max-w-[1600px] px-4 py-10 text-center">
        <p className="text-bad">Failed to load match. Please try again.</p>
        <Link href="/exchange" className="mt-4 inline-block text-accentSoft hover:underline">Back to Exchange</Link>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="mx-auto max-w-[1600px] px-4 py-10">
        <div className="glass rounded-xl p-8 animate-pulse space-y-3">
          <div className="h-8 bg-panel2 rounded w-2/3" />
          <div className="h-4 bg-panel2 rounded w-1/3" />
          <div className="h-32 bg-panel2 rounded mt-4" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] px-2 md:px-4 py-4">
      <div className="grid grid-cols-12 gap-3">
        <section className="col-span-12 md:col-span-9">
          <MatchHeader match={match} />

          {/* Market type tabs */}
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar mb-4 pb-1">
            {allTypes.map((type) => (
              <button
                key={type}
                onClick={() => setActiveType(type)}
                className={cn(
                  "px-4 py-2 rounded-md text-sm font-semibold whitespace-nowrap transition border",
                  currentType === type
                    ? "bg-accent-grad text-ink border-transparent shadow-glow"
                    : "bg-panel2 text-white/70 border-line hover:border-accent hover:text-white",
                )}
              >
                {getMarketLabel(type)}
              </button>
            ))}
          </div>

          {/* Markets */}
          {visibleMarkets.length === 0 && (
            <div className="glass rounded-xl p-8 text-center text-white/50">
              No markets available for this selection.
            </div>
          )}

          {visibleMarkets.map((market) =>
            isFancyLike(market.type) ? (
              <FancyTable key={market.id} market={market} matchName={match.name} />
            ) : (
              <BackLayMarket key={market.id} market={market} matchName={match.name} />
            ),
          )}
        </section>

        <aside className="col-span-12 md:col-span-3">
          <div className="md:sticky md:top-32">
            <Betslip />
          </div>
        </aside>
      </div>
    </div>
  );
}

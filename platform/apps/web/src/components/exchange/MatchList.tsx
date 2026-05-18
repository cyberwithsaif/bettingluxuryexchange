"use client";
import useSWR from "swr";
import { MatchCard } from "./MatchCard";

interface MatchData {
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
    minStake: string;
    maxStake: string;
    runners: Array<{
      id: string;
      name: string;
      backPrices: number[] | null;
      layPrices: number[] | null;
    }>;
  }>;
}

export function MatchList({ sport }: { sport: string }) {
  const { data, error, isLoading } = useSWR<MatchData[]>(`/markets/matches?sport=${sport}`);

  if (isLoading) return <SkeletonRows />;
  if (error) return <p className="glass rounded-xl p-6 text-bad">Failed to load matches.</p>;
  if (!data?.length) return <EmptyState sport={sport} />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl tracking-wide capitalize">{sport} Exchange</h1>
        <div className="flex gap-1 text-xs">
          <Tab label="Highlights" active />
          <Tab label="In Play" />
          <Tab label="Today" />
          <Tab label="Tomorrow" />
        </div>
      </div>
      {data.map((m) => <MatchCard key={m.id} match={m} />)}
    </div>
  );
}

function Tab({ label, active }: { label: string; active?: boolean }) {
  return (
    <button
      className={
        "px-3 py-1.5 rounded-md font-semibold uppercase tracking-wider " +
        (active ? "bg-accent-grad text-ink shadow-glowSoft" : "bg-panel2/60 text-white/70 hover:bg-panel2")
      }
    >
      {label}
    </button>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="glass rounded-xl p-4 animate-pulse h-28" />
      ))}
    </div>
  );
}

function EmptyState({ sport }: { sport: string }) {
  return (
    <div className="glass rounded-xl p-8 text-center">
      <h3 className="font-display text-2xl">No live {sport} matches yet</h3>
      <p className="text-white/60 text-sm mt-2">
        Run the cricket ingest from the admin panel, or wait for the operator to add markets.
      </p>
    </div>
  );
}

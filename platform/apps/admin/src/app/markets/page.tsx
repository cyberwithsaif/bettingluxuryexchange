"use client";
import useSWR, { mutate } from "swr";
import { useState } from "react";
import { api } from "@/lib/api";

export default function MarketsAdmin() {
  const [sport, setSport] = useState("cricket");
  const { data: matches } = useSWR(`/markets/matches?sport=${sport}`);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  async function syncLive() {
    setSyncing(true); setSyncMsg(null);
    try {
      const { data } = await api.post("/sports/cricket/sync/live");
      setSyncMsg(`Imported ${data.synced} matches (live ${data.live}, upcoming ${data.upcoming}).`);
      mutate(`/markets/matches?sport=${sport}`);
    } catch (e: any) {
      setSyncMsg(e?.response?.data?.message || "Sync failed — check your Cricket API key in API Keys.");
    } finally { setSyncing(false); }
  }
  async function syncBetfair() {
    setSyncing(true); setSyncMsg(null);
    try {
      const { data } = await api.post("/sports/betfair/sync");
      setSyncMsg(`Betfair: ${data.synced} markets (live ${data.live}, upcoming ${data.upcoming}).${data.note ? " " + data.note : ""}`);
      mutate(`/markets/matches?sport=${sport}`);
    } catch (e: any) {
      setSyncMsg(e?.response?.data?.message || "Betfair sync failed — add app_key + session_token in API Keys.");
    } finally { setSyncing(false); }
  }
  async function deleteMarket(id: string) {
    if (!confirm("Delete this market? Its runners and ALL bets/exposure on it are permanently removed.")) return;
    try { await api.delete(`/admin/markets/${id}`); mutate(`/markets/matches?sport=${sport}`); }
    catch (e: any) { alert(e?.response?.data?.message || "Delete failed"); }
  }
  async function deleteMatch(id: string) {
    if (!confirm("Delete this entire match and all its markets/bets? This cannot be undone.")) return;
    try { await api.delete(`/admin/matches/${id}`); mutate(`/markets/matches?sport=${sport}`); }
    catch (e: any) { alert(e?.response?.data?.message || "Delete failed"); }
  }

  async function setStatus(marketId: string, status: string) {
    await api.post(`/admin/markets/${marketId}/status`, { status });
    mutate(`/markets/matches?sport=${sport}`);
  }
  async function settle(marketId: string, winningRunnerId?: string, voidMarket?: boolean) {
    await api.post(`/admin/markets/${marketId}/settle`, { winningRunnerId, voidMarket: voidMarket ?? false });
    mutate(`/markets/matches?sport=${sport}`);
  }
  async function setOdds(marketId: string, runnerId: string, back: string, lay: string) {
    const backPrices = back.split(",").map((s) => Number(s.trim())).filter((n) => !isNaN(n) && n > 1);
    const layPrices  = lay.split(",").map((s) => Number(s.trim())).filter((n) => !isNaN(n) && n > 1);
    if (!backPrices.length || !layPrices.length) { alert("Enter at least one valid odds value > 1.00"); return; }
    await api.post(`/admin/markets/${marketId}/odds`, { runnerId, backPrices, layPrices });
    mutate(`/markets/matches?sport=${sport}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-black text-gray-100">Markets</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={syncLive}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white bg-gradient-to-r from-emerald-500 to-green-600 shadow-[0_2px_12px_rgba(0,200,83,0.4)] hover:brightness-110 disabled:opacity-50 transition"
            title="Import real live/upcoming cricket matches from the Cricket API"
          >
            {syncing ? "Syncing…" : "Sync Live Cricket"}
          </button>
          <button
            onClick={syncBetfair}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white bg-gradient-to-r from-indigo-500 to-blue-600 shadow-[0_2px_12px_rgba(79,70,229,0.4)] hover:brightness-110 disabled:opacity-50 transition"
            title="Import authentic back/lay cricket odds from Betfair Exchange"
          >
            Sync Betfair
          </button>
          <select
            value={sport}
            onChange={(e) => setSport(e.target.value)}
            className="border border-yellow-200 bg-gray-800 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-yellow-400 shadow-sm"
          >
            {["cricket", "football", "tennis", "basketball"].map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>
      {syncMsg && (
        <div className="text-sm px-4 py-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">{syncMsg}</div>
      )}

      {(!matches || (matches as any[]).length === 0) && (
        <div className="rounded-xl border border-yellow-500/20 bg-gray-800 p-10 text-center text-gray-500 shadow-sm">
          <p className="font-medium">No live matches</p>
          <p className="text-xs mt-1 text-gray-400">No {sport} matches available right now.</p>
        </div>
      )}

      {(matches as any[] ?? []).map((m: any) => (
        <div key={m.id} className="rounded-xl border border-yellow-500/20 bg-gray-800 p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-bold text-gray-200">
              {m.name}
              <span className="text-xs text-gray-500 ml-2">{new Date(m.startTime).toLocaleString("en-IN")}</span>
            </h3>
            <button onClick={() => deleteMatch(m.id)}
              className="shrink-0 text-xs px-2 py-1 rounded-lg border border-red-500/40 text-red-300 bg-red-500/15 hover:bg-red-500/25 font-medium transition">
              Delete Match
            </button>
          </div>
          {(m.markets ?? []).map((mk: any) => (
            <div key={mk.id} className="mt-3 rounded-lg border border-gray-700 p-3 bg-gray-800">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-200">
                  {mk.name}
                  <span className={`text-xs ml-2 px-1.5 py-0.5 rounded-full border font-semibold ${
                    mk.status === "OPEN" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" : "bg-yellow-500/15 text-yellow-300 border-yellow-500/30"
                  }`}>{mk.status}</span>
                </span>
                <div className="flex gap-1">
                  {mk.status === "OPEN"
                    ? <button onClick={() => setStatus(mk.id, "SUSPENDED")} className="text-xs px-2 py-1 rounded-lg border border-yellow-500/30 text-yellow-300 bg-gray-800 hover:bg-yellow-500/20 font-medium transition">Suspend</button>
                    : <button onClick={() => setStatus(mk.id, "OPEN")} className="text-xs px-2 py-1 rounded-lg border border-emerald-500/30 text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25 font-medium transition">Resume</button>
                  }
                  <button onClick={() => settle(mk.id, undefined, true)} className="text-xs px-2 py-1 rounded-lg border border-red-500/30 text-red-400 bg-red-900/20 hover:bg-red-500/20 font-medium transition">Void</button>
                  <button onClick={() => deleteMarket(mk.id)} className="text-xs px-2 py-1 rounded-lg border border-red-500/40 text-red-300 bg-red-500/15 hover:bg-red-500/25 font-medium transition">Delete</button>
                </div>
              </div>

              <div className="mt-2 grid gap-2">
                {mk.runners.map((r: any) => (
                  <RunnerRow key={r.id} marketId={mk.id} runner={r} onOdds={setOdds} onSettleWinner={(rid) => settle(mk.id, rid)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function RunnerRow({ marketId, runner, onOdds, onSettleWinner }: {
  marketId: string;
  runner: any;
  onOdds: (mid: string, rid: string, b: string, l: string) => void;
  onSettleWinner: (rid: string) => void;
}) {
  const [back, setBack] = useState((runner.backPrices ?? []).join(","));
  const [lay, setLay]   = useState((runner.layPrices  ?? []).join(","));
  return (
    <div className="grid grid-cols-12 gap-2 items-center">
      <span className="col-span-3 font-semibold text-gray-300 truncate">{runner.name}</span>
      <input
        value={back}
        onChange={(e) => setBack(e.target.value)}
        placeholder="1.85,1.84"
        className="col-span-3 bg-gray-800 border border-yellow-200 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-yellow-400"
      />
      <input
        value={lay}
        onChange={(e) => setLay(e.target.value)}
        placeholder="1.87,1.88"
        className="col-span-3 bg-gray-800 border border-yellow-200 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-yellow-400"
      />
      <button
        onClick={() => onOdds(marketId, runner.id, back, lay)}
        className="col-span-1 text-xs px-2 py-1 rounded-lg bg-gradient-to-r from-yellow-400 to-amber-500 text-gray-100 font-bold"
      >Set</button>
      <button
        onClick={() => onSettleWinner(runner.id)}
        className="col-span-2 text-xs px-2 py-1 rounded-lg border border-emerald-200 text-emerald-300 bg-emerald-50 hover:bg-emerald-100 font-medium transition"
      >Settle as winner</button>
    </div>
  );
}

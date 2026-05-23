"use client";
import useSWR, { mutate } from "swr";
import { useState } from "react";
import { api } from "@/lib/api";

export default function MarketsAdmin() {
  const [sport, setSport] = useState("cricket");
  const { data: matches } = useSWR(`/markets/matches?sport=${sport}`);

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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-gray-900">Markets</h1>
        <select
          value={sport}
          onChange={(e) => setSport(e.target.value)}
          className="border border-yellow-200 bg-white rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-yellow-400 shadow-sm"
        >
          {["cricket", "football", "tennis", "basketball"].map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      {(!matches || (matches as any[]).length === 0) && (
        <div className="rounded-xl border border-yellow-100 bg-white p-10 text-center text-gray-500 shadow-sm">
          <p className="font-medium">No live matches</p>
          <p className="text-xs mt-1 text-gray-400">No {sport} matches available right now.</p>
        </div>
      )}

      {(matches as any[] ?? []).map((m: any) => (
        <div key={m.id} className="rounded-xl border border-yellow-100 bg-white p-4 shadow-sm">
          <h3 className="font-bold text-gray-800">
            {m.name}
            <span className="text-xs text-gray-500 ml-2">{new Date(m.startTime).toLocaleString("en-IN")}</span>
          </h3>
          {(m.markets ?? []).map((mk: any) => (
            <div key={mk.id} className="mt-3 rounded-lg border border-gray-100 p-3 bg-gray-50">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-800">
                  {mk.name}
                  <span className={`text-xs ml-2 px-1.5 py-0.5 rounded-full border font-semibold ${
                    mk.status === "OPEN" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-yellow-50 text-yellow-700 border-yellow-200"
                  }`}>{mk.status}</span>
                </span>
                <div className="flex gap-1">
                  {mk.status === "OPEN"
                    ? <button onClick={() => setStatus(mk.id, "SUSPENDED")} className="text-xs px-2 py-1 rounded-lg border border-yellow-200 text-yellow-700 bg-yellow-50 hover:bg-yellow-100 font-medium transition">Suspend</button>
                    : <button onClick={() => setStatus(mk.id, "OPEN")} className="text-xs px-2 py-1 rounded-lg border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 font-medium transition">Resume</button>
                  }
                  <button onClick={() => settle(mk.id, undefined, true)} className="text-xs px-2 py-1 rounded-lg border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 font-medium transition">Void</button>
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
      <span className="col-span-3 font-semibold text-gray-700 truncate">{runner.name}</span>
      <input
        value={back}
        onChange={(e) => setBack(e.target.value)}
        placeholder="1.85,1.84"
        className="col-span-3 bg-white border border-yellow-200 rounded px-2 py-1 text-xs text-gray-800 focus:outline-none focus:border-yellow-400"
      />
      <input
        value={lay}
        onChange={(e) => setLay(e.target.value)}
        placeholder="1.87,1.88"
        className="col-span-3 bg-white border border-yellow-200 rounded px-2 py-1 text-xs text-gray-800 focus:outline-none focus:border-yellow-400"
      />
      <button
        onClick={() => onOdds(marketId, runner.id, back, lay)}
        className="col-span-1 text-xs px-2 py-1 rounded-lg bg-gradient-to-r from-yellow-400 to-amber-500 text-slate-900 font-bold"
      >Set</button>
      <button
        onClick={() => onSettleWinner(runner.id)}
        className="col-span-2 text-xs px-2 py-1 rounded-lg border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 font-medium transition"
      >Settle as winner</button>
    </div>
  );
}

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
        <h1 className="font-display text-4xl">Markets</h1>
        <select value={sport} onChange={(e) => setSport(e.target.value)} className="bg-panel border border-line rounded-md px-3 py-2 text-sm">
          {["cricket", "football", "tennis", "basketball"].map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      {(matches ?? []).map((m: any) => (
        <div key={m.id} className="rounded-xl border border-line bg-panel/60 p-4">
          <h3 className="font-bold">{m.name} <span className="text-xs text-white/50 ml-2">{new Date(m.startTime).toLocaleString("en-IN")}</span></h3>
          {(m.markets ?? []).map((mk: any) => (
            <div key={mk.id} className="mt-3 rounded-lg border border-line/60 p-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{mk.name} <span className="text-xs text-white/50 ml-2">{mk.status}</span></span>
                <div className="flex gap-1">
                  {mk.status === "OPEN"
                    ? <button onClick={() => setStatus(mk.id, "SUSPENDED")} className="text-xs px-2 py-1 rounded bg-accent/15 text-accentSoft hover:bg-accent/25">Suspend</button>
                    : <button onClick={() => setStatus(mk.id, "OPEN")} className="text-xs px-2 py-1 rounded bg-ok/15 text-ok hover:bg-ok/25">Resume</button>
                  }
                  <button onClick={() => settle(mk.id, undefined, true)} className="text-xs px-2 py-1 rounded bg-bad/15 text-bad hover:bg-bad/25">Void</button>
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

function RunnerRow({ marketId, runner, onOdds, onSettleWinner }: { marketId: string; runner: any; onOdds: (mid: string, rid: string, b: string, l: string) => void; onSettleWinner: (rid: string) => void }) {
  const [back, setBack] = useState((runner.backPrices ?? []).join(","));
  const [lay, setLay]   = useState((runner.layPrices  ?? []).join(","));
  return (
    <div className="grid grid-cols-12 gap-2 items-center">
      <span className="col-span-3 font-semibold truncate">{runner.name}</span>
      <input value={back} onChange={(e) => setBack(e.target.value)} placeholder="1.85,1.84" className="col-span-3 bg-bg border border-line rounded px-2 py-1 text-xs" />
      <input value={lay} onChange={(e) => setLay(e.target.value)} placeholder="1.87,1.88" className="col-span-3 bg-bg border border-line rounded px-2 py-1 text-xs" />
      <button onClick={() => onOdds(marketId, runner.id, back, lay)} className="col-span-1 text-xs px-2 py-1 rounded bg-accent-grad text-ink font-bold">Set</button>
      <button onClick={() => onSettleWinner(runner.id)} className="col-span-2 text-xs px-2 py-1 rounded bg-ok/15 text-ok hover:bg-ok/25">Settle as winner</button>
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";

function pad(n: number) { return String(n).padStart(2, "0"); }

export function CountdownTimer({ target }: { target: Date }) {
  const [diff, setDiff] = useState(0);

  useEffect(() => {
    const tick = () => setDiff(Math.max(0, Math.floor((target.getTime() - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);

  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;

  return (
    <div className="flex items-center gap-2">
      {[
        { v: d, label: "d" },
        { v: h, label: "h" },
        { v: m, label: "m" },
        { v: s, label: "s" },
      ].map(({ v, label }) => (
        <div key={label} className="flex flex-col items-center">
          <div className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 min-w-[36px] text-center">
            <span className="text-base font-black text-white tabular-nums">{pad(v)}</span>
          </div>
          <span className="text-[9px] text-white/30 mt-0.5 uppercase tracking-wider">{label}</span>
        </div>
      ))}
    </div>
  );
}

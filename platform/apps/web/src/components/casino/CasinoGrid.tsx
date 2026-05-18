"use client";
import useSWR from "swr";
import { useState } from "react";
import { Search, Play } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/auth";
import { cn } from "@/lib/cn";

interface Game {
  id: string;
  name: string;
  category: string;
  thumbnail?: string | null;
  isLive: boolean;
  provider: { key: string; name: string };
}
interface Provider { id: string; key: string; name: string; }

export function CasinoGrid({ category, title }: { category?: string; title: string }) {
  const [providerKey, setProviderKey] = useState<string>("");
  const [q, setQ] = useState("");
  const user = useAuthStore((s) => s.user);

  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (providerKey) params.set("provider", providerKey);
  if (q) params.set("q", q);

  const { data: games } = useSWR<Game[]>(`/casino/games?${params}`);
  const { data: providers } = useSWR<Provider[]>("/casino/providers");

  const launch = async (gameId: string) => {
    if (!user) { window.location.href = "/auth/login"; return; }
    const { data } = await api.post(`/casino/session/${gameId}`);
    window.open(data.launchUrl, "_blank", "noopener");
  };

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="font-display text-4xl bg-accent-grad bg-clip-text text-transparent">{title}</h1>
          <p className="text-white/60 text-sm">Tap a tile to launch.</p>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-white/40" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search game" className="bg-panel2 border border-line rounded-md pl-7 pr-3 py-2 text-sm w-60 focus:outline-none focus:border-accent" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        <Chip label="All" active={!providerKey} onClick={() => setProviderKey("")} />
        {(providers ?? []).map((p) => (
          <Chip key={p.id} label={p.name} active={providerKey === p.key} onClick={() => setProviderKey(p.key)} />
        ))}
      </div>

      {!games?.length ? (
        <div className="glass rounded-xl p-10 text-center text-white/60">
          No games configured yet — admin can add them in <code className="text-accentSoft">Admin → Casino</code>.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {games.map((g) => (
            <button
              key={g.id}
              onClick={() => launch(g.id)}
              className="group relative aspect-[4/5] rounded-xl overflow-hidden glass hover:border-accent transition"
            >
              <div className="absolute inset-0 bg-panel-grad" />
              {g.thumbnail
                ? <img src={g.thumbnail} alt={g.name} className="absolute inset-0 h-full w-full object-cover opacity-80 group-hover:opacity-100" />
                : <div className="absolute inset-0 grid place-items-center font-display text-3xl text-white/40">{g.name.slice(0, 2)}</div>
              }
              <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent" />
              <div className="absolute inset-0 flex flex-col justify-end p-3">
                <p className="font-bold text-sm leading-tight">{g.name}</p>
                <p className="text-[10px] uppercase tracking-wider text-accentSoft">{g.provider.name}</p>
              </div>
              {g.isLive && (
                <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-bad text-white animate-pulseGlow">LIVE</span>
              )}
              <div className="absolute inset-0 grid place-items-center opacity-0 group-hover:opacity-100 transition">
                <span className="h-12 w-12 grid place-items-center rounded-full bg-accent-grad shadow-glow text-ink">
                  <Play size={20} />
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 rounded-md text-xs font-semibold border transition",
        active
          ? "bg-accent-grad text-ink border-transparent shadow-glow"
          : "bg-panel2 text-white/80 border-line hover:border-accent",
      )}
    >
      {label}
    </button>
  );
}

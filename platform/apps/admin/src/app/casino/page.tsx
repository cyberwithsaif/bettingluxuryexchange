"use client";
import useSWR from "swr";

export default function AdminCasinoPage() {
  const { data: games } = useSWR("/casino/games");
  const { data: providers } = useSWR("/casino/providers");
  return (
    <div className="space-y-4">
      <h1 className="font-display text-4xl">Casino</h1>
      <p className="text-sm text-white/60">Configure providers in <span className="text-accentSoft">API Keys</span>. Games are imported from the provider catalogue after credentials are saved.</p>

      <section className="rounded-xl border border-line bg-panel/60 p-4">
        <h2 className="font-display text-2xl mb-2">Providers</h2>
        <ul className="flex flex-wrap gap-2 text-sm">
          {(providers ?? []).map((p: any) => (
            <li key={p.id} className="px-3 py-1 rounded border border-line">{p.name}</li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-line bg-panel/60 p-4">
        <h2 className="font-display text-2xl mb-2">Games ({games?.length ?? 0})</h2>
        <p className="text-xs text-white/50">{games?.length ? "Synced from provider." : "No games yet — connect a provider and import its game catalogue."}</p>
      </section>
    </div>
  );
}

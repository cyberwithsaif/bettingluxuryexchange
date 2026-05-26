"use client";
import { useState } from "react";
import { useLiveData } from "@/lib/hooks";
import { PageHeader, GlassCard, Badge, DataTable, type Column } from "@/components/ui";
import { ShieldCheck, Hash, CheckCircle2, XCircle, Copy } from "lucide-react";

interface SeedRow {
  id: string;
  game: string;
  username: string;
  serverSeed: string | null;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  status: string;
  createdAt: string;
}

const GAMES = ["all", "mines", "plinko", "pump", "dice", "towers", "chicken-road"];
const GAME_TONE: Record<string, string> = {
  mines: "red", plinko: "violet", pump: "amber", dice: "sky", towers: "emerald", "chicken-road": "orange",
};

function short(s: string | null, n = 10) {
  if (!s) return "—";
  return s.length <= n * 2 ? s : `${s.slice(0, n)}…${s.slice(-6)}`;
}

async function sha256Hex(input: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function ProvablyFairPage() {
  const [game, setGame] = useState("all");
  const [username, setUsername] = useState("");
  const query = `/admin/provably-fair?game=${game === "all" ? "" : game}&username=${encodeURIComponent(username)}&limit=120`;
  const { data, isLoading } = useLiveData<SeedRow[]>(query, 20000);

  const columns: Column<SeedRow>[] = [
    { key: "game", header: "Game", sortValue: (r) => r.game, render: (r) => <Badge tone={GAME_TONE[r.game] ?? "slate"}>{r.game}</Badge> },
    { key: "username", header: "User", sortValue: (r) => r.username, render: (r) => <span className="font-medium text-gray-200">{r.username}</span> },
    { key: "serverSeedHash", header: "Server Seed Hash", render: (r) => <Copyable value={r.serverSeedHash} /> },
    { key: "serverSeed", header: "Server Seed", render: (r) => r.serverSeed ? <Copyable value={r.serverSeed} /> : <Badge tone="amber">hidden · live</Badge> },
    { key: "clientSeed", header: "Client Seed", render: (r) => <Copyable value={r.clientSeed} /> },
    { key: "nonce", header: "Nonce", align: "right", sortValue: (r) => r.nonce, render: (r) => <span className="tabular-nums text-gray-300">{r.nonce}</span> },
    { key: "status", header: "Status", render: (r) => <Badge tone={r.status === "BUSTED" ? "red" : r.status === "IN_PROGRESS" || r.status === "ACTIVE" ? "amber" : "emerald"}>{r.status}</Badge> },
    { key: "createdAt", header: "Time", sortValue: (r) => r.createdAt, render: (r) => <span className="text-gray-500 text-xs whitespace-nowrap">{new Date(r.createdAt).toLocaleString("en-IN")}</span> },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader title="Provably Fair" subtitle="Server / client seeds, nonces and hash verification across all in-house games" />

      <Verifier />

      {/* Game filter */}
      <div className="flex items-center gap-2 flex-wrap">
        {GAMES.map((g) => (
          <button key={g} onClick={() => setGame(g)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition border ${
              game === g ? "bg-yellow-400 text-gray-900 border-yellow-400" : "bg-gray-800/60 text-gray-400 border-gray-700 hover:border-yellow-400/50"
            }`}>
            {g.replace("-", " ")}
          </button>
        ))}
        <input
          value={username} onChange={(e) => setUsername(e.target.value)}
          placeholder="Filter by username…"
          className="ml-auto bg-gray-900/60 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 outline-none focus:border-yellow-400/60 placeholder:text-gray-600"
        />
      </div>

      <DataTable
        columns={columns}
        rows={data ?? []}
        loading={isLoading}
        pageSize={15}
        exportName="provably-fair"
        rowKey={(r) => r.id}
        emptyText="No seed records found"
      />
    </div>
  );
}

function Copyable({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
      title={value}
      className="group inline-flex items-center gap-1.5 font-mono text-xs text-gray-400 hover:text-yellow-400 transition"
    >
      {short(value)}
      {copied ? <CheckCircle2 size={12} className="text-emerald-400" /> : <Copy size={12} className="opacity-0 group-hover:opacity-100" />}
    </button>
  );
}

/* Hash verifier — confirm sha256(serverSeed) === published hash, client-side */
function Verifier() {
  const [seed, setSeed] = useState("");
  const [hash, setHash] = useState("");
  const [result, setResult] = useState<null | { ok: boolean; computed: string }>(null);

  const verify = async () => {
    if (!seed.trim()) return;
    const computed = await sha256Hex(seed.trim());
    setResult({ ok: computed.toLowerCase() === hash.trim().toLowerCase(), computed });
  };

  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <ShieldCheck size={18} className="text-yellow-400" />
        <h2 className="font-black text-gray-100">Hash Verifier</h2>
        <span className="text-xs text-gray-500">SHA-256(server seed) must equal the published hash</span>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">Server Seed (revealed)</label>
          <textarea value={seed} onChange={(e) => setSeed(e.target.value)} rows={2}
            className="mt-1 w-full bg-gray-900/60 border border-gray-700 rounded-lg px-3 py-2 text-xs font-mono text-gray-200 outline-none focus:border-yellow-400/60 resize-none" placeholder="paste server seed" />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">Published Server Seed Hash</label>
          <textarea value={hash} onChange={(e) => setHash(e.target.value)} rows={2}
            className="mt-1 w-full bg-gray-900/60 border border-gray-700 rounded-lg px-3 py-2 text-xs font-mono text-gray-200 outline-none focus:border-yellow-400/60 resize-none" placeholder="paste expected hash" />
        </div>
      </div>
      <div className="flex items-center gap-3 mt-3 flex-wrap">
        <button onClick={verify} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-gray-900 bg-gradient-to-r from-yellow-400 to-yellow-500 hover:brightness-110 transition">
          <Hash size={15} /> Verify
        </button>
        {result && (
          result.ok
            ? <Badge tone="emerald"><CheckCircle2 size={13} /> Match — provably fair</Badge>
            : <Badge tone="red"><XCircle size={13} /> Mismatch — does not verify</Badge>
        )}
        {result && <span className="font-mono text-[11px] text-gray-500 break-all">computed: {result.computed}</span>}
      </div>
    </GlassCard>
  );
}

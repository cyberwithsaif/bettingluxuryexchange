"use client";
import { useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/cn";

const DUMMY_CASINO_PROVIDERS = ["Ezugi", "MAC88", "Top Spin", "Game Tech", "Turbo Gaming", "SA Gaming", "InOut Gaming", "SmartSoft Gaming", "Simple Play", "Iconic 21", "Indian Casino", "Jade Rabbit", "Million Games", "Slots Garden", "Win Fast", "CreedRoomz", "Cock Fight", "Vivo Gaming", "Evolution Gaming", "PopOk", "Pascal Gaming", "Aviator", "Jilli", "Pinoy Bet Games", "Mac88 Excite", "Matka", "Tarzan Gaming", "Playtech", "Supernowa"];
const DUMMY_CASINO_CATEGORIES = ["Teen Patti", "Sexy Games", "Dragon Tiger", "Andar Bahar", "Bollywood", "3 Cards Judgement", "7 Up Down", "High Low", "Lucky 7", "Poker", "Roulette", "Baccarat", "Black Jack", "Casino War"];
const DUMMY_CASINO_GAMES = [
  { name: "Play Teenpatti", img: "https://placehold.co/300x400/990000/FFFFFF?text=Teenpatti", prov: "Supernowa" },
  { name: "2 Card Teenpatti", img: "https://placehold.co/300x400/005500/FFFFFF?text=2+Card", prov: "Top Spin" },
  { name: "One Day Teenpatti", img: "https://placehold.co/300x400/333333/FFFFFF?text=One+Day", prov: "Ezugi" },
  { name: "Mufils Teenpatti", img: "https://placehold.co/300x400/0000aa/FFFFFF?text=Mufils", prov: "Supernowa" },
  { name: "Rng Teenpatti", img: "https://placehold.co/300x400/660066/FFFFFF?text=Rng", prov: "Supernowa" },
  { name: "Speed Baccarat", img: "https://placehold.co/300x400/aa5500/FFFFFF?text=Baccarat", prov: "SA Gaming" },
  { name: "C Ultra Roulette", img: "https://placehold.co/300x400/00aa55/FFFFFF?text=Roulette", prov: "SA Gaming" },
  { name: "Dragon Tiger", img: "https://placehold.co/300x400/aa0000/FFFFFF?text=Dragon+Tiger", prov: "SA Gaming" }
];

const DUMMY_CRASH_PROVIDERS = ["Studio 21", "Top Spin", "SmartSoft Gaming", "Turbo Gaming", "InOut Gaming", "Game Tech", "Million Games", "PopOk", "Pascal Gaming", "Aviator", "Jilli", "Simple Play", "Mascot Games", "Mac88 Virtual", "Aviatrix", "B Gaming", "Tarzan Gaming"];
const DUMMY_CRASH_CATEGORIES = ["Chicken Road", "Chicken X", "Super Sixer", "Cricket", "Aviator", "Alien", "Flytrap", "Others", "Vortex", "Aero", "Crash X", "JavelinX", "Cricket Boom", "Dice", "Mines", "Plinko", "Spin Strike"];
const DUMMY_CRASH_GAMES = [
  { name: "Chicken Road", img: "https://placehold.co/300x400/cc0055/FFFFFF?text=Chicken+Road", prov: "InOut" },
  { name: "Chicken Road 2", img: "https://placehold.co/300x400/dd2200/FFFFFF?text=Chicken+Road+2", prov: "InOut" },
  { name: "Chicken X", img: "https://placehold.co/300x400/0055cc/FFFFFF?text=Chicken+X", prov: "Million Games" },
  { name: "Super Sixer Xtreme", img: "https://placehold.co/300x400/00aa00/FFFFFF?text=Super+Sixer", prov: "Top Spin" },
  { name: "Super Sixer Classic", img: "https://placehold.co/300x400/ff6600/FFFFFF?text=Sixer+Classic", prov: "Top Spin" },
  { name: "Super Sixer Mines", img: "https://placehold.co/300x400/aa0000/FFFFFF?text=Sixer+Mines", prov: "Top Spin" },
  { name: "Play Cricket", img: "https://placehold.co/300x400/333333/FFFFFF?text=Play+Cricket", prov: "Studio 21" },
  { name: "Aviator", img: "https://placehold.co/300x400/cc0000/FFFFFF?text=Aviator", prov: "Spribe" },
  { name: "Alien Abduction", img: "https://placehold.co/300x400/00cc00/FFFFFF?text=Alien", prov: "Studio 21" }
];

export function CasinoGrid({ category, title }: { category?: string; title: string }) {
  const [providerKey, setProviderKey] = useState<string>("All");
  const [categoryKey, setCategoryKey] = useState<string>("All");
  const [q, setQ] = useState("");

  const isCrash = title.toUpperCase().includes("CRASH");
  const providers = isCrash ? DUMMY_CRASH_PROVIDERS : DUMMY_CASINO_PROVIDERS;
  const categories = isCrash ? DUMMY_CRASH_CATEGORIES : DUMMY_CASINO_CATEGORIES;
  const games = isCrash ? DUMMY_CRASH_GAMES : DUMMY_CASINO_GAMES;

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6">
      
      <div className="flex flex-col mb-4">
        <h1 className="font-display text-5xl font-black text-brandRed tracking-tight uppercase">{title}</h1>
        <h2 className="font-display text-2xl font-bold text-white uppercase mt-1">BET NOW ON MULTIPLE {title}</h2>
      </div>

      <div className="flex justify-end mb-4 relative">
        <div className="relative w-64">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search game" className="bg-transparent border border-gray-600 rounded-full pl-4 pr-10 py-1.5 text-sm w-full focus:outline-none focus:border-brandRed text-white" />
        </div>
      </div>

      {/* Providers Row */}
      <div className="flex flex-wrap gap-2 mb-4">
        <Chip label="All" active={providerKey === "All"} onClick={() => setProviderKey("All")} />
        {providers.map((p) => (
          <Chip key={p} label={p} active={providerKey === p} onClick={() => setProviderKey(p)} />
        ))}
      </div>

      {/* Categories Row */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Chip label="All" active={categoryKey === "All"} onClick={() => setCategoryKey("All")} />
        {categories.map((c) => (
          <Chip key={c} label={c} active={categoryKey === c} onClick={() => setCategoryKey(c)} />
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-8 gap-3">
        {games.map((g, i) => (
          <button
            key={i}
            className="group relative aspect-[4/5] rounded-xl overflow-hidden glass border border-transparent hover:border-brandRed transition transform hover:-translate-y-1"
          >
            <img src={g.img} alt={g.name} className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
            <div className="absolute bottom-0 inset-x-0 p-2 text-left">
              <p className="font-bold text-sm leading-tight text-white">{g.name}</p>
              <p className="text-[10px] uppercase tracking-wider text-brandYellow">{g.prov}</p>
            </div>
          </button>
        ))}
      </div>
      
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-4 py-2 rounded text-xs font-bold transition border",
        active
          ? "bg-accent-grad text-white border-transparent"
          : "bg-transparent text-white border-gray-600 hover:border-white",
      )}
    >
      {label}
    </button>
  );
}

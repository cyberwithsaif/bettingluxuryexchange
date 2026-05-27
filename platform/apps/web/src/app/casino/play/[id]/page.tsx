"use client";

import useSWR from "swr";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft, Maximize2 } from "lucide-react";
import { useRef } from "react";
import { useAuthStore } from "@/lib/stores/auth";

interface Launch {
  url: string;
  name: string;
  provider: string;
}

export default function CasinoPlayPage() {
  const params = useParams<{ id: string }>();
  const user = useAuthStore((s) => s.user);
  const frameRef = useRef<HTMLIFrameElement>(null);

  const { data, error, isLoading } = useSWR<Launch>(
    user && params?.id ? `/casino/games/${params.id}/launch` : null,
  );

  const goFullscreen = () => frameRef.current?.requestFullscreen?.();

  return (
    <div className="mx-auto max-w-[1400px] px-2 md:px-4 py-3">
      <div className="flex items-center justify-between mb-3">
        <Link href="/casino" className="flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition">
          <ChevronLeft size={18} /> Back to Casino
        </Link>
        {data && (
          <div className="text-right">
            <p className="font-bold leading-tight">{data.name}</p>
            <p className="text-[11px] text-white/45 uppercase tracking-wider">{data.provider} · Demo</p>
          </div>
        )}
        {data && (
          <button onClick={goFullscreen} className="flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition ml-3">
            <Maximize2 size={16} /> Fullscreen
          </button>
        )}
      </div>

      {!user && (
        <div className="glass rounded-xl p-10 text-center text-white/60">
          <p className="font-semibold text-lg">Please log in to play.</p>
          <Link href="/login" className="mt-4 inline-block px-5 py-2 rounded-lg bg-accent-grad text-ink font-bold">Log in</Link>
        </div>
      )}

      {user && error && (
        <div className="glass rounded-xl p-10 text-center text-bad">
          <p className="font-semibold">Couldn’t launch this game.</p>
          <p className="text-sm text-white/50 mt-1">
            {(error as any)?.response?.data?.message ?? "The casino catalogue may not be configured yet."}
          </p>
          <Link href="/casino" className="mt-4 inline-block text-accentSoft hover:underline">Back to Casino</Link>
        </div>
      )}

      {user && isLoading && (
        <div className="glass rounded-xl h-[70vh] animate-pulse grid place-items-center text-white/30">Loading game…</div>
      )}

      {user && data?.url && (
        <div className="rounded-xl overflow-hidden border border-line bg-black" style={{ height: "78vh" }}>
          <iframe
            ref={frameRef}
            src={data.url}
            title={data.name}
            className="w-full h-full"
            allow="autoplay; fullscreen; clipboard-write; encrypted-media"
            allowFullScreen
          />
        </div>
      )}
    </div>
  );
}

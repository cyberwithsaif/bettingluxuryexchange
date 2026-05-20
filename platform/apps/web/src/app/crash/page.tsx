import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CasinoGrid } from "@/components/casino/CasinoGrid";

export default function CrashPage() {
  return (
    <>
      <div className="md:hidden flex items-center gap-2 px-4 py-3 bg-[#0F1923] border-b border-white/10 sticky top-0 z-10">
        <Link href="/casino" className="flex items-center gap-1.5 text-white/60 hover:text-white text-sm font-semibold transition">
          <ArrowLeft size={16} /> Back
        </Link>
        <span className="text-white font-bold text-sm">Crash Games</span>
      </div>
      <CasinoGrid category="CRASH" title="Crash Games" />
    </>
  );
}

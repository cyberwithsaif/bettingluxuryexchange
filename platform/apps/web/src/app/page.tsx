import { GameCarousel } from "@/components/GameCarousel";

export default async function HomePage() {

  return (
    <div className="w-full px-3 md:px-5 py-4 space-y-6 max-w-[1400px] mx-auto">

      {/* Ads Banner */}
      <div className="w-full rounded-3xl overflow-hidden border border-white/10 hover:border-white/20 transition-all duration-300 min-h-[160px] md:min-h-[220px] bg-gradient-to-r from-yellow-600 via-yellow-500 to-amber-500 hover:shadow-2xl hover:scale-[1.01]">
        <div className="relative w-full h-full flex items-center justify-center">
          <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-black/20 pointer-events-none" />
          <div className="relative z-10 text-center">
            <p className="text-white/80 text-sm md:text-base font-semibold uppercase tracking-widest mb-2">Special Promotion</p>
            <h2 className="text-white font-black text-3xl md:text-5xl mb-3">Up to 50% Bonus</h2>
            <p className="text-white/90 text-base md:text-lg mb-6">Deposit now and claim your welcome bonus</p>
            <button className="px-6 md:px-8 py-2.5 md:py-3 bg-white text-amber-600 font-bold rounded-full hover:bg-white/90 transition-all active:scale-95">
              Claim Now
            </button>
          </div>
        </div>
      </div>

      {/* DiamondPlay Originals */}
      <GameCarousel />

    </div>
  );
}

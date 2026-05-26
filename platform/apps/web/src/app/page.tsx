import Image from "next/image";
import { GameCarousel } from "@/components/GameCarousel";

export default async function HomePage() {

  return (
    <div className="w-full px-3 md:px-5 py-4 space-y-6 max-w-[1400px] mx-auto">

      {/* Ads Banners */}
      <div className="grid grid-cols-2 gap-3 md:gap-4">
        {/* Casino Banner */}
        <div className="group relative rounded-2xl md:rounded-3xl overflow-visible border border-white/10 hover:border-white/20 transition-all duration-300 min-h-[90px] md:min-h-[175px] hover:shadow-2xl hover:scale-[1.02] cursor-pointer">
          {/* Background */}
          <div className="absolute inset-0 rounded-2xl md:rounded-3xl overflow-hidden" style={{ backgroundImage: "url('/images/bgping.png')", backgroundSize: "cover", backgroundPosition: "center" }} />

          {/* Neon card — desktop only */}
          <div className="hidden md:flex absolute inset-0 items-center justify-center pointer-events-none -inset-12 top-6">
            <Image src="/images/neoncard.png" alt="Neon Card" width={320} height={214} priority style={{ objectFit: "contain" }} />
          </div>

          {/* Casino art — contained on desktop, overflows on mobile via CSS */}
          <div className="absolute inset-0 z-10 pointer-events-none casino-overlay">
            <Image src="/images/casino.png" alt="Casino" fill sizes="50vw" className="object-contain object-left" priority />
          </div>

          {/* Float chips — desktop only */}
          <div className="hidden md:block absolute -right-8 top-0 w-full h-full z-10">
            <Image src="/images/float.png" alt="Floating Chips" fill sizes="50vw" className="object-contain object-right" priority />
          </div>
        </div>

        {/* Sports Banner */}
        <div className="group relative rounded-2xl md:rounded-3xl overflow-visible border border-white/10 hover:border-white/20 transition-all duration-300 min-h-[90px] md:min-h-[175px] hover:shadow-2xl hover:scale-[1.02] cursor-pointer">
          {/* Background — clipped */}
          <div className="absolute inset-0 rounded-2xl md:rounded-3xl overflow-hidden">
            <Image src="/images/bannercric.png" alt="Sports Banner Background" fill sizes="50vw" className="object-cover object-center" priority />
          </div>
          {/* Foreground — responsive overflow */}
          <div className="absolute z-10 pointer-events-none sports-overlay"
            style={{ left: "-28%", right: "-28%", top: "-30%", bottom: "-45%" }}>
            <Image src="/images/sportb.png" alt="Sports" fill sizes="50vw" className="object-contain object-center" priority />
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 767px) {
          .casino-overlay { left: -10% !important; right: -10% !important; top: -12% !important; bottom: -18% !important; }
          .sports-overlay { left: -25% !important; right: -25% !important; top: -30% !important; bottom: -38% !important; }
        }
      `}</style>

      {/* DiamondPlay Originals */}
      <GameCarousel />

    </div>
  );
}

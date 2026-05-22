import Image from "next/image";
import { GameCarousel } from "@/components/GameCarousel";

export default async function HomePage() {

  return (
    <div className="w-full px-3 md:px-5 py-4 space-y-6 max-w-[1400px] mx-auto">

      {/* Ads Banners */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Casino Banner */}
        <div className="group relative rounded-3xl overflow-visible border border-white/10 hover:border-white/20 transition-all duration-300 min-h-[130px] md:min-h-[175px] hover:shadow-2xl hover:scale-[1.02] cursor-pointer">
          {/* Background color */}
          <div className="absolute inset-0 rounded-3xl" style={{ background: "#f21f5f" }} />

          {/* Background image - left positioned with slight overflow */}
          <div className="absolute -left-4 top-0 w-full h-full">
            <Image
              src="/images/casino.png"
              alt="Casino"
              fill
              className="object-contain object-left"

              priority
            />
          </div>

          {/* Float image - right positioned with slight overflow */}
          <div className="absolute -right-8 top-0 w-full h-full">
            <Image
              src="/images/float.png"
              alt="Floating Chips"
              fill
              className="object-contain object-right"

              priority
            />
          </div>

          {/* Neon card - center positioned */}
          <div className="absolute inset-0 flex items-center justify-center">
            <Image
              src="/images/neoncard.png"
              alt="Neon Card"
              width={120}
              height={150}
              priority
              style={{ objectFit: "contain" }}
            />
          </div>

          {/* Overlay gradient - removed for solid color */}

          {/* Content */}
          <div className="relative z-10 h-full p-4 md:p-6 flex flex-col justify-between hidden"></div>
        </div>

        {/* Sports Banner */}
        <div className="group relative rounded-3xl overflow-hidden border border-white/10 hover:border-white/20 transition-all duration-300 min-h-[130px] md:min-h-[175px] hover:shadow-2xl hover:scale-[1.02] cursor-pointer">
          {/* Background gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500 via-orange-600 to-orange-800" />

          {/* Overlay gradient */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-black/30 to-transparent pointer-events-none" />

          {/* Content */}
          <div className="relative z-10 h-full p-4 md:p-6 flex flex-col justify-between hidden"></div>

        </div>
      </div>

      {/* DiamondPlay Originals */}
      <GameCarousel />

    </div>
  );
}

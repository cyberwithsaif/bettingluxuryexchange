import { MatchList } from "@/components/exchange/MatchList";
import { HeroBanner } from "@/components/HeroBanner";
import { PromoBannerStrip } from "@/components/PromoBannerStrip";
import { MobileTopCasinoStrip } from "@/components/mobile/MobileTopCasinoStrip";
import { MobileCategoryPills } from "@/components/mobile/MobileCategoryPills";

export default function ExchangePage({ searchParams }: { searchParams: { sport?: string } }) {
  const sport = searchParams.sport ?? "cricket";
  return (
    <div className="mx-auto max-w-[1600px] px-2 md:px-4 py-3 md:py-4">
      {/* Full-width match list — tap a match to open its full markets (betslip lives there). */}
      <section className="min-w-0 space-y-0">
        <PromoBannerStrip />
        <MobileTopCasinoStrip />
        <MobileCategoryPills />
        <MatchList sport={sport} />
        <div className="hidden md:block mt-4">
          <HeroBanner />
        </div>
      </section>
    </div>
  );
}

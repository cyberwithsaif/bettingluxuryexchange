import { SportsSidebar } from "@/components/exchange/SportsSidebar";
import { MatchList } from "@/components/exchange/MatchList";
import { Betslip } from "@/components/exchange/Betslip";
import { HeroBanner } from "@/components/HeroBanner";
import { PromoBannerStrip } from "@/components/PromoBannerStrip";

export default function ExchangePage({ searchParams }: { searchParams: { sport?: string } }) {
  const sport = searchParams.sport ?? "cricket";
  return (
    <div className="mx-auto max-w-[1600px] px-2 md:px-4 py-4">
      <div className="grid grid-cols-12 gap-3">
        <aside className="hidden md:block md:col-span-2">
          <SportsSidebar active={sport} />
        </aside>

        <section className="col-span-12 md:col-span-7 space-y-0">
          <MatchList sport={sport} />
          <PromoBannerStrip />
          <HeroBanner />
        </section>

        <aside className="col-span-12 md:col-span-3">
          <div className="md:sticky md:top-32">
            <Betslip />
          </div>
        </aside>
      </div>
    </div>
  );
}

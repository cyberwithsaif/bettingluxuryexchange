"use client";
import useSWR from "swr";
import { PageHeader, GlassCard, StatCard, Badge } from "@/components/ui";
import { Crown, Award, Percent, Users, Info } from "lucide-react";

interface Tier {
  name: string; tier: number; min: number; max: number | null;
  color: string; cashback: number; perks: string[]; members: number;
}
interface Overview { totalMembers: number; tiers: Tier[]; }

const KEY = "/admin/vip/overview";
const k = (n: number) => (n >= 1000 ? `₹${Math.round(n / 1000).toLocaleString("en-IN")}K` : `₹${n}`);
const range = (t: Tier) => `${t.min === 0 ? "Start" : k(t.min)} — ${t.max === null ? "∞" : k(t.max)}`;

export default function VipPage() {
  const { data, isLoading } = useSWR<Overview>(KEY);
  const tiers = data?.tiers ?? [];
  const topCashback = Math.max(0, ...tiers.map((t) => t.cashback));

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader title="VIP Levels" subtitle="Loyalty tiers — assigned automatically by total deposits" />

      <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-4 py-3 flex items-start gap-2 text-sm text-sky-200/80">
        <Info size={15} className="mt-0.5 shrink-0 text-sky-400" />
        Levels are derived from each player's <b className="text-sky-300">total deposits</b> (deposits + admin credit) — the same rule the player VIP page uses. There's nothing to assign manually; a player moves up automatically when their deposits cross a threshold.
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="VIP Levels"   value={String(tiers.length)}        Icon={Crown}   accent="amber"   loading={isLoading} />
        <StatCard label="Total Players" value={String(data?.totalMembers ?? 0)} Icon={Users}   accent="violet"  loading={isLoading} />
        <StatCard label="Top Cashback" value={`${topCashback}%`}            Icon={Percent} accent="emerald" loading={isLoading} />
      </div>

      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-44 bg-gray-700/40 rounded-xl animate-pulse" />)}</div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tiers.map((t) => (
            <GlassCard key={t.tier} glow className="p-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl opacity-20" style={{ background: t.color }} />
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Crown size={20} style={{ color: t.color }} />
                  <h3 className="font-black text-gray-100">{t.name}</h3>
                  <Badge tone="slate">Tier {t.tier}</Badge>
                </div>
                <span className="text-lg font-black tabular-nums" style={{ color: t.color }}>{t.cashback}%</span>
              </div>
              <div className="space-y-1.5 text-sm">
                <Row icon={<Award size={13} />}   label="Members"     value={String(t.members)} />
                <Row icon={<Percent size={13} />} label="Cashback"    value={`${t.cashback}%`} />
                <Row icon={<Crown size={13} />}   label="Deposit Req" value={range(t)} />
              </div>
              {t.perks.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {t.perks.map((p, i) => <Badge key={i} tone="amber">{p}</Badge>)}
                </div>
              )}
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1.5 text-gray-400">{icon}{label}</span>
      <span className="font-bold tabular-nums text-gray-200">{value}</span>
    </div>
  );
}

"use client";
import useSWR from "swr";
import { PageHeader, StatCard, GlassCard } from "@/components/ui";
import { Wallet, Users, UserCheck, Ticket, TrendingDown, Percent, Clock, ArrowDownToLine, ShieldAlert } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const inr = (n: number) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export default function BookieDashboard() {
  const { data, isLoading } = useSWR<any>("/bookie/dashboard");
  const { data: wallet } = useSWR<any>("/bookie/wallet");

  // Build a running-balance series from the wallet ledger (oldest → newest).
  const series = (wallet?.ledger ?? []).slice().reverse().map((l: any, i: number) => ({
    i, balance: Number(l.balanceAfter), label: new Date(l.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
  }));

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Your wallet, users and performance at a glance." />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label="Wallet Balance" value={inr(data?.wallet?.balance ?? 0)} sub={`Available ${inr(data?.wallet?.available ?? 0)}`} Icon={Wallet} accent="emerald" loading={isLoading} />
        <StatCard label="Total Users" value={data?.totalUsers ?? 0} Icon={Users} accent="sky" loading={isLoading} />
        <StatCard label="Active Users" value={data?.activeUsers ?? 0} Icon={UserCheck} accent="violet" loading={isLoading} />
        <StatCard label="Total Bets" value={data?.totalBets ?? 0} Icon={Ticket} accent="amber" loading={isLoading} />
        <StatCard label="Bookie Profit" value={inr(data?.bookieProfit ?? 0)} sub="total player losses" Icon={TrendingDown} accent="amber" loading={isLoading} />
        <StatCard label="Pending Withdrawals" value={data?.pendingWithdrawals ?? 0} Icon={Clock} accent="amber" loading={isLoading} />
        <StatCard label="Deposits Today" value={inr(data?.depositsToday ?? 0)} Icon={ArrowDownToLine} accent="emerald" loading={isLoading} />
        <StatCard label="Exposure" value={inr(data?.exposure ?? 0)} Icon={ShieldAlert} accent="red" loading={isLoading} />
      </div>

      {/* Admin commission — auto-deducted from your wallet as profit accrues. */}
      <div className="mb-4">
        <GlassCard glow className="p-5 flex flex-wrap items-center justify-between gap-4 border-emerald-500/30">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-emerald-500/10"><Percent size={22} className="text-emerald-400" /></div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">Admin Commission</p>
              <p className="text-sm text-gray-400">{data?.commissionPct ?? 0}% of your bookie profit ({inr(data?.bookieProfit ?? 0)}) — auto-deducted from your wallet</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-3xl font-black tabular-nums text-emerald-300">{inr(data?.adminCommission ?? 0)}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">{inr(data?.commissionCollected ?? 0)} collected</p>
          </div>
        </GlassCard>
      </div>

      <GlassCard className="p-5">
        <h3 className="font-black text-gray-100 mb-1">Wallet History</h3>
        <p className="text-xs text-gray-500 mb-4">Running balance across your recent wallet movements.</p>
        <div className="h-64">
          {series.length === 0 ? (
            <div className="h-full grid place-items-center text-gray-500 text-sm">No wallet movements yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00c853" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#00c853" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: 11 }} />
                <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} width={50} />
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid rgba(0,200,83,0.3)", borderRadius: 8, color: "#f3f4f6" }} formatter={(v: any) => inr(Number(v))} />
                <Area type="monotone" dataKey="balance" stroke="#00c853" strokeWidth={2} fill="url(#g)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </GlassCard>
    </div>
  );
}

"use client";
import { useMemo, useState } from "react";
import { ChevronUp, ChevronDown, Search, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

/* ─── Page header ──────────────────────────────────────────────────────────── */

export function PageHeader({ title, subtitle, right }: {
  title: string; subtitle?: string; right?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between flex-wrap gap-3 mb-5">
      <div>
        <h1 className="text-2xl font-black text-gray-100">{title}</h1>
        {subtitle && <p className="text-gray-500 text-sm mt-0.5">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function LiveDot({ label = "Live" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-gray-500">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
      </span>
      {label}
    </div>
  );
}

/* ─── Glass card ───────────────────────────────────────────────────────────── */

export function GlassCard({ className, children, glow, ...rest }: React.HTMLAttributes<HTMLDivElement> & { glow?: boolean }) {
  return (
    <div
      {...rest}
      className={cn(
        "rounded-xl border border-yellow-500/20 bg-gray-800/80 backdrop-blur-sm shadow-[0_8px_30px_rgba(0,0,0,0.35)] transition-all duration-200",
        glow && "hover:border-yellow-400/60 hover:shadow-[0_0_24px_rgba(255,204,0,0.12)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ─── Stat card ────────────────────────────────────────────────────────────── */

type AccentStyle = { icon: string; bg: string; value: string };
const VIOLET: AccentStyle = { icon: "text-violet-400", bg: "bg-violet-500/10", value: "text-gray-100" };
const ACCENT: Record<string, AccentStyle> = {
  violet:  VIOLET,
  emerald: { icon: "text-emerald-400", bg: "bg-emerald-500/10", value: "text-emerald-300" },
  sky:     { icon: "text-sky-400",     bg: "bg-sky-500/10",     value: "text-sky-300" },
  orange:  { icon: "text-orange-400",  bg: "bg-orange-500/10",  value: "text-orange-300" },
  amber:   { icon: "text-amber-400",   bg: "bg-amber-500/10",   value: "text-amber-300" },
  red:     { icon: "text-red-400",     bg: "bg-red-500/10",     value: "text-red-400" },
  slate:   { icon: "text-gray-400",    bg: "bg-gray-700/40",    value: "text-gray-200" },
};

export function StatCard({ label, value, Icon, accent = "violet", sub, loading }: {
  label: string; value: React.ReactNode; Icon?: any; accent?: keyof typeof ACCENT | string; sub?: string; loading?: boolean;
}) {
  const a: AccentStyle = ACCENT[accent] ?? VIOLET;
  return (
    <GlassCard glow className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-2 truncate">{label}</p>
          {loading ? <div className="h-7 w-20 bg-gray-700 rounded animate-pulse" />
            : <p className={cn("text-xl font-black tabular-nums", a.value)}>{value}</p>}
          {sub && !loading && <p className="text-[11px] text-gray-500 mt-1 truncate">{sub}</p>}
        </div>
        {Icon && <div className={cn("p-2 rounded-lg shrink-0", a.bg)}><Icon size={16} className={a.icon} /></div>}
      </div>
    </GlassCard>
  );
}

/* ─── Badge ────────────────────────────────────────────────────────────────── */

const BADGE: Record<string, string> = {
  emerald: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  red:     "bg-red-500/15     text-red-300     border-red-500/30",
  amber:   "bg-amber-500/15   text-amber-300   border-amber-500/30",
  sky:     "bg-sky-500/15     text-sky-300     border-sky-500/30",
  violet:  "bg-violet-500/15  text-violet-300  border-violet-500/30",
  slate:   "bg-gray-700/50    text-gray-300    border-gray-600/50",
};

export function Badge({ children, tone = "slate", className }: { children: React.ReactNode; tone?: keyof typeof BADGE | string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-semibold whitespace-nowrap", BADGE[tone] ?? BADGE.slate, className)}>
      {children}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("bg-gray-700/50 rounded-lg animate-pulse", className)} />;
}

/* ─── DataTable: search · sort · paginate · CSV export ─────────────────────── */

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number;
  exportValue?: (row: T) => string | number;
  align?: "left" | "right" | "center";
  className?: string;
}

export function DataTable<T>({
  columns, rows, loading, searchKeys, searchPlaceholder = "Search…",
  pageSize = 15, exportName, emptyText = "No records", rowKey,
}: {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  searchKeys?: (keyof T | ((row: T) => string))[];
  searchPlaceholder?: string;
  pageSize?: number;
  exportName?: string;
  emptyText?: string;
  rowKey: (row: T, i: number) => string;
}) {
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    if (!q.trim() || !searchKeys?.length) return rows;
    const needle = q.toLowerCase();
    return rows.filter((r) =>
      searchKeys.some((k) => {
        const v = typeof k === "function" ? k(r) : r[k];
        return String(v ?? "").toLowerCase().includes(needle);
      }),
    );
  }, [rows, q, searchKeys]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return filtered;
    const arr = [...filtered].sort((a, b) => {
      const va = col.sortValue!(a); const vb = col.sortValue!(b);
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, sortKey, sortDir, columns]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const exportCsv = () => {
    const head = columns.map((c) => `"${c.header}"`).join(",");
    const body = sorted.map((r) =>
      columns.map((c) => {
        const v = c.exportValue ? c.exportValue(r) : (r as any)[c.key];
        return `"${String(v ?? "").replace(/"/g, '""')}"`;
      }).join(","),
    ).join("\n");
    const blob = new Blob([head + "\n" + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${exportName ?? "export"}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <GlassCard className="overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-700/60 flex-wrap">
        {searchKeys?.length ? (
          <div className="flex items-center gap-2 bg-gray-900/60 border border-gray-700 rounded-lg px-3 py-1.5 flex-1 min-w-[180px] max-w-xs">
            <Search size={14} className="text-gray-500 shrink-0" />
            <input
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(0); }}
              placeholder={searchPlaceholder}
              className="bg-transparent text-sm text-gray-200 outline-none w-full placeholder:text-gray-600"
            />
          </div>
        ) : <div className="flex-1" />}
        <span className="text-xs text-gray-500 tabular-nums">{sorted.length} rows</span>
        {exportName && (
          <button onClick={exportCsv} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-300 bg-gray-900/60 border border-gray-700 hover:border-yellow-400/60 hover:text-yellow-400 transition">
            <Download size={13} /> CSV
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700/60">
              {columns.map((c) => (
                <th
                  key={c.key}
                  onClick={c.sortValue ? () => toggleSort(c.key) : undefined}
                  className={cn(
                    "px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400 bg-gray-900/40 whitespace-nowrap",
                    c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left",
                    c.sortValue && "cursor-pointer select-none hover:text-yellow-400",
                  )}
                >
                  <span className="inline-flex items-center gap-1">
                    {c.header}
                    {sortKey === c.key && (sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-800/50">
                  {columns.map((c) => <td key={c.key} className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>)}
                </tr>
              ))
            ) : pageRows.length === 0 ? (
              <tr><td colSpan={columns.length} className="px-4 py-12 text-center text-gray-500 text-sm">{emptyText}</td></tr>
            ) : (
              pageRows.map((r, i) => (
                <tr key={rowKey(r, i)} className="border-b border-gray-800/40 hover:bg-gray-700/20 transition-colors">
                  {columns.map((c) => (
                    <td key={c.key} className={cn(
                      "px-4 py-3 text-gray-300",
                      c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left",
                      c.className,
                    )}>
                      {c.render ? c.render(r) : String((r as any)[c.key] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pageCount > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-700/60">
          <span className="text-xs text-gray-500">Page {safePage + 1} of {pageCount}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0}
              className="p-1.5 rounded-lg bg-gray-900/60 border border-gray-700 text-gray-400 disabled:opacity-30 hover:border-yellow-400/60 transition">
              <ChevronLeft size={15} />
            </button>
            <button onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={safePage >= pageCount - 1}
              className="p-1.5 rounded-lg bg-gray-900/60 border border-gray-700 text-gray-400 disabled:opacity-30 hover:border-yellow-400/60 transition">
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}
    </GlassCard>
  );
}

/* ─── Radial gauge (Recharts) ──────────────────────────────────────────────── */

export function gaugeColor(pct: number) {
  return pct >= 85 ? "#f87171" : pct >= 60 ? "#fbbf24" : "#34d399";
}

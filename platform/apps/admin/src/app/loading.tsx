export default function Loading() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
      <div className="relative h-10 w-10">
        <div className="absolute inset-0 rounded-full border-2 border-white/10" />
        <div className="absolute inset-0 rounded-full border-2 border-t-accent border-r-accent border-b-transparent border-l-transparent animate-spin" />
      </div>
      <p className="text-white/40 text-xs font-medium tracking-wider uppercase">Loading…</p>
    </div>
  );
}

export default function Loading() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 px-6">
      <div className="relative h-12 w-12">
        <div className="absolute inset-0 rounded-full border-4 border-white/10" />
        <div className="absolute inset-0 rounded-full border-4 border-t-brandYellow border-r-brandRed border-b-transparent border-l-transparent animate-spin" />
      </div>
      <p className="text-white/40 text-sm font-medium tracking-wider uppercase">Loading…</p>
    </div>
  );
}

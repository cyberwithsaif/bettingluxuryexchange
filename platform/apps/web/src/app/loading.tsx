export default function Loading() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 px-6 bg-[#090c1c]">
      <div className="relative h-12 w-12">
        <div className="absolute inset-0 rounded-full border-4 border-white/10" />
        <div
          className="absolute inset-0 rounded-full border-4 animate-spin"
          style={{
            borderTopColor: '#a78bfa',
            borderRightColor: '#8b5cf6',
            borderBottomColor: 'transparent',
            borderLeftColor: 'transparent',
          }}
        />
      </div>
      <p className="text-white/40 text-sm font-medium tracking-wider uppercase">Loading…</p>
    </div>
  );
}

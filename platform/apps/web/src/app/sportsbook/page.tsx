export default function SportsbookPage() {
  return (
    <div className="mx-auto max-w-[1600px] px-4 py-12 text-center">
      <h1 className="font-display text-4xl bg-accent-grad bg-clip-text text-transparent">Sportsbook</h1>
      <p className="text-white/60 mt-3">
        Pre-match fixed-odds sportsbook — connect a provider (Pinnacle / The Odds API) from{" "}
        <span className="text-accentSoft">Admin → API Keys</span> to populate this lobby.
      </p>
    </div>
  );
}

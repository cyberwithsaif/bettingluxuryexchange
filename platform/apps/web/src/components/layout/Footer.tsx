import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-12 border-t border-line bg-ink/60">
      <div className="mx-auto max-w-[1600px] px-4 py-8 grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
        <div>
          <div className="font-display text-2xl bg-accent-grad bg-clip-text text-transparent">Exch</div>
          <p className="text-white/60 mt-2">
            Premium betting exchange & casino platform — built for operators, scaled for players.
          </p>
        </div>
        <FooterCol title="Sports" links={[
          ["Cricket", "/exchange?sport=cricket"],
          ["Football", "/exchange?sport=football"],
          ["Tennis", "/exchange?sport=tennis"],
        ]} />
        <FooterCol title="Casino" links={[
          ["Live Casino", "/casino"],
          ["Crash Games", "/crash"],
          ["Slots", "/slots"],
          ["Lottery", "/lottery"],
        ]} />
        <FooterCol title="Support" links={[
          ["Terms", "/legal/terms"],
          ["Privacy", "/legal/privacy"],
          ["Responsible Gaming", "/legal/responsible-gaming"],
          ["Contact", "/contact"],
        ]} />
      </div>
      <div className="border-t border-line/60 text-center text-xs text-white/40 py-3">
        © {new Date().getFullYear()} Exch Platform. Bet responsibly. 18+.
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <h4 className="font-bold text-white/80 mb-2">{title}</h4>
      <ul className="space-y-1.5 text-white/60">
        {links.map(([l, h]) => (
          <li key={h}><Link className="hover:text-accentSoft" href={h}>{l}</Link></li>
        ))}
      </ul>
    </div>
  );
}

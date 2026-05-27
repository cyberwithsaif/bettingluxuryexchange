import Link from "next/link";
import Image from "next/image";
import { ShieldCheck, Zap, Headphones, Send, Twitter, Instagram, Mail, ChevronRight } from "lucide-react";

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="relative mt-16 overflow-hidden border-t border-white/10"
      style={{ background: "linear-gradient(180deg, #0d0813 0%, #090611 100%)" }}>
      {/* top accent line + glow */}
      <div className="absolute top-0 inset-x-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, rgba(243,196,49,0.55), rgba(220,47,47,0.55), transparent)" }} />
      <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[620px] h-48 rounded-full opacity-20 blur-3xl pointer-events-none"
        style={{ background: "radial-gradient(circle, #dc2f2f, transparent)" }} />

      <div className="relative mx-auto max-w-[1600px] px-5 py-10">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-2">
            <div className="flex items-center gap-2.5 mb-3">
              <span className="relative w-9 h-9 rounded-full overflow-hidden ring-1 ring-white/15 shrink-0">
                <Image src="/logo.png" alt="Exch" fill sizes="36px" className="object-cover" />
              </span>
              <span className="font-display text-2xl bg-accent-grad bg-clip-text text-transparent">Exch</span>
            </div>
            <p className="text-white/55 text-sm leading-relaxed max-w-xs">
              Premium betting exchange &amp; casino platform — built for operators, scaled for players.
            </p>

            {/* trust chips */}
            <div className="flex flex-wrap gap-2 mt-4">
              <Trust icon={<ShieldCheck size={12} />} label="Provably Fair" />
              <Trust icon={<Zap size={12} />} label="Instant Payouts" />
              <Trust icon={<Headphones size={12} />} label="24/7 Support" />
            </div>

            {/* socials */}
            <div className="flex items-center gap-2 mt-4">
              <Social label="Telegram"  href="#"><Send size={15} /></Social>
              <Social label="Twitter"   href="#"><Twitter size={15} /></Social>
              <Social label="Instagram" href="#"><Instagram size={15} /></Social>
              <Social label="Email"     href="/contact"><Mail size={15} /></Social>
            </div>
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
      </div>

      {/* bottom bar */}
      <div className="relative border-t border-white/[0.06]">
        <div className="mx-auto max-w-[1600px] px-5 py-4 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs text-white/45">
          <span>© {year} Exch Platform. All rights reserved.</span>
          <span className="flex items-center gap-2.5">
            <span className="font-bold px-2 py-0.5 rounded-md border border-red-500/40 text-red-400">18+</span>
            <span className="text-white/40">Gamble responsibly. Play within your limits.</span>
          </span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <h4 className="font-bold text-white text-sm mb-3 flex items-center gap-2">
        <span className="w-1 h-4 rounded-full bg-accent-grad" />
        {title}
      </h4>
      <ul className="space-y-2 text-sm">
        {links.map(([l, h]) => (
          <li key={h}>
            <Link href={h} className="group inline-flex items-center gap-1 text-white/55 hover:text-accentSoft transition-colors">
              <ChevronRight size={12} className="text-white/20 group-hover:text-accentSoft -ml-3 opacity-0 group-hover:opacity-100 group-hover:ml-0 transition-all" />
              {l}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Trust({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium text-white/65"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <span className="text-accentSoft">{icon}</span>{label}
    </span>
  );
}

function Social({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <Link href={href} aria-label={label}
      className="w-9 h-9 rounded-lg flex items-center justify-center text-white/55 transition-all hover:text-white hover:-translate-y-0.5"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
      {children}
    </Link>
  );
}

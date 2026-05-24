import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const ROOT = 'd:\\DEVELOPMENTS\\casino betting website exch\\';
const cp = String.fromCodePoint;

// Every corrupted pattern confirmed by codepoint diagnostic.
// Pattern = what Node.js sees when reading the double-encoded UTF-8 file.
const fixes = [
  // ── Punctuation ────────────────────────────────────────────────────────────
  // ₹  U+20B9  (â‚¹)
  [cp(0xE2,0x201A,0xB9),   cp(0x20B9)],
  // …  U+2026  (â€¦)
  [cp(0xE2,0x20AC,0xA6),   cp(0x2026)],
  // –  U+2013  (â€") — U+201D confirmed by diagnostic
  [cp(0xE2,0x20AC,0x201D), cp(0x2013)],
  // →  U+2192  (â†') — U+2019 confirmed
  [cp(0xE2,0x2020,0x2019), cp(0x2192)],
  // ←  U+2190  (â†)  — U+0090 C1 control
  [cp(0xE2,0x2020,0x90),   cp(0x2190)],
  // ↑  U+2191  (â†') — U+2018 confirmed by diagnostic
  [cp(0xE2,0x2020,0x2018), cp(0x2191)],
  // ↓  U+2193  (â†") — U+201C confirmed by diagnostic
  [cp(0xE2,0x2020,0x201C), cp(0x2193)],
  // ─  U+2500  box-drawing (in comments only)
  [cp(0xE2,0x201D,0x20AC), cp(0x2500)],

  // ── Casino-bets emojis ─────────────────────────────────────────────────────
  // 💣 U+1F4A3  (F0 9F 92 A3) — U+2019 confirmed
  [cp(0xF0,0x0178,0x2019,0xA3),  cp(0x1F4A3)],
  // 🎯 U+1F3AF  (F0 9F 8F AF) — U+008F C1 control
  [cp(0xF0,0x0178,0x8F,0xAF),    cp(0x1F3AF)],
  // 🎈 U+1F388  (F0 9F 8E 88) — U+017D + U+02C6 confirmed by diagnostic
  [cp(0xF0,0x0178,0x017D,0x02C6),cp(0x1F388)],
  // 🎲 U+1F3B2  (F0 9F 8E B2) — U+017D + U+00B2
  [cp(0xF0,0x0178,0x017D,0xB2),  cp(0x1F3B2)],
  // 🎡 U+1F3A1  (F0 9F 8E A1) — U+017D + U+00A1
  [cp(0xF0,0x0178,0x017D,0xA1),  cp(0x1F3A1)],

  // ── Other-page emojis (login, nav, settings) ───────────────────────────────
  // 👥 U+1F465  (F0 9F 91 A5) — U+2018 + U+00A5 confirmed
  [cp(0xF0,0x0178,0x2018,0xA5),  cp(0x1F465)],
  // 📊 U+1F4CA  (F0 9F 93 8A) — U+201C + U+0160 confirmed
  [cp(0xF0,0x0178,0x201C,0x0160),cp(0x1F4CA)],
  // 💳 U+1F4B3  (F0 9F 92 B3) — U+2019 + U+00B3 confirmed
  [cp(0xF0,0x0178,0x2019,0xB3),  cp(0x1F4B3)],
  // 🎰 U+1F3B0  (F0 9F 8E B0) — U+017D + U+00B0 confirmed
  [cp(0xF0,0x0178,0x017D,0xB0),  cp(0x1F3B0)],
  // 🚀 U+1F680  (F0 9F 9A 80) — U+0161 + U+20AC confirmed
  [cp(0xF0,0x0178,0x0161,0x20AC),cp(0x1F680)],
  // 🎮 U+1F3AE  (F0 9F 8E AE) — U+017D + U+00AE confirmed
  [cp(0xF0,0x0178,0x017D,0xAE),  cp(0x1F3AE)],
  // 🥽 U+1F97D  (F0 9F A5 BD) — U+00A5 + U+00BD confirmed
  [cp(0xF0,0x0178,0xA5,0xBD),    cp(0x1F97D)],
  // 🔴 U+1F534  (F0 9F 94 B4) — U+201D + U+00B4 confirmed
  [cp(0xF0,0x0178,0x201D,0xB4),  cp(0x1F534)],
  // 🎟️ U+1F39F + U+FE0F  (F0 9F 8E 9F EF B8 8F) — U+017D + U+0178 + ï¸ (U+00EF U+00B8 U+008F)
  [cp(0xF0,0x0178,0x017D,0x0178) + cp(0xEF,0xB8,0x8F), cp(0x1F39F,0xFE0F)],
];

const files = execSync('git grep -rl "." -- platform/apps/admin/src/', { encoding: 'utf8', cwd: ROOT.slice(0,-1) })
  .trim().split('\n').filter(f => /\.(tsx|ts|css)$/.test(f));

let fixedCount = 0;
for (const file of files) {
  const fullPath = ROOT + file.replace(/\//g, '\\');
  let content;
  try { content = readFileSync(fullPath, 'utf8'); } catch { continue; }
  const original = content;
  for (const [bad, good] of fixes) {
    content = content.split(bad).join(good);
  }
  if (content !== original) {
    writeFileSync(fullPath, content, 'utf8');
    console.log('Fixed:', file);
    fixedCount++;
  }
}
console.log('Done. Fixed', fixedCount, 'files.');

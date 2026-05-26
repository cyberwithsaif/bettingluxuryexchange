# Project — Casino / Betting Exchange Platform

White-label betting exchange + casino platform (Diamond Exchange / Future9-style).
Dark luxury UI. Monorepo lives under `platform/` (pnpm workspace).

## Structure

- `platform/apps/web`   — Next.js 16 (Turbopack) player site
- `platform/apps/admin` — Next.js 16 admin panel (basePath `/admin`)
- `platform/apps/api`   — NestJS API + Socket.io gateways (Prisma + PostgreSQL + Redis)
- `platform/packages/shared` — shared TS package

Casino games (web): coinflip, crash, dice, mines, plinko, pump, roulette, towers, slots, lottery.
- `mines` → `components/mines/MinesLayout.tsx`; `pump` → `components/pump/PumpGame.tsx`
- `crash`/`slots`/`lottery` → `components/casino/CasinoGrid.tsx` (game listing grids)
- All games render with full site layout (AppSidebar + TopBar) EXCEPT `roulette` (fullscreen).
  Controlled by `components/layout/LayoutWrapper.tsx` (`isFullScreen`).

TopBar height: `h-[60px]` mobile / `h-[74px]` desktop — account for this in any `100vh` math.

## Mobile responsiveness pattern

Games use one of two responsive patterns (follow these when editing):
- **Stack pattern** (mines, towers): root `min-h-screen md:h-[calc(100vh-74px)]`, mobile-only header
  (`md:hidden`), body `flex flex-col-reverse md:flex-row`, main area `overflow-y-auto md:overflow-hidden`.
  Mobile scrolls naturally; desktop fits viewport.
- **Dedicated layouts** (pump, dice, plinko): separate `lg:hidden` mobile controls and
  `hidden lg:flex` desktop sidebar.

## VPS Deployment

- Host: `root@51.222.84.91` (domain `diamondplay22.site`)
- SSH key: `~/.ssh/diamond_idrsa` (identical copy of `E:\illweb\diamond exc\id_rsa`)
- Project path on VPS: `/var/www/exch` (build from `/var/www/exch/platform`)
- Process manager: PM2 cluster — apps `exch-web`, `exch-api`, `exch-admin`
- GitHub repo is **public**: `cyberwithsaif/bettingluxuryexchange` (HTTPS pull works unauthenticated)

Deploy flow (commit & push locally first, then on VPS pull + build + restart):

```bash
# local
git add <files> && git commit -m "..." && git push origin main

# deploy (one line)
ssh -i ~/.ssh/diamond_idrsa root@51.222.84.91 "cd /var/www/exch && git pull origin main && cd platform && npm run build && pm2 restart exch-web"
```

- `npm run build` in `platform/` runs `pnpm -r run build` (all apps).
- Restart only the app you changed: `exch-web` (frontend), `exch-api` (backend), `exch-admin` (admin).
- If `git pull` is blocked by local VPS changes, `git stash` first then pull.

## Conventions

- Currency formatted as `₹` with `en-IN` locale.
- Casino API routes are prefixed `casino/` in controllers; NestJS global prefix adds `/api`
  → full route e.g. `/api/casino/towers/active`.
- Provably fair games use HMAC-SHA256 (server seed + client seed + nonce).

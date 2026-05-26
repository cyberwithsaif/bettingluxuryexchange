# DiamondPlay — White-Label Betting Exchange & Casino Platform

A modern, full-stack **betting exchange + casino** platform built from scratch. It pairs a Betfair-style sports exchange (back/lay markets, fancy/session markets) with a full in-house casino (provably-fair originals + provider-agnostic lobby), a multi-tier agent hierarchy, and a complete admin back office.

> **Theme:** dark luxury — deep navy/maroon/black with red→orange gradient highlights, gold accents, glassmorphism and neon glow.

---

## Monorepo Structure

A `pnpm` workspace under [`platform/`](platform/):

```
platform/
├── apps/
│   ├── api/     # NestJS REST API + Socket.io gateways (port 4000)
│   ├── web/     # Next.js 16 player site            (port 3000)
│   └── admin/   # Next.js 16 admin panel             (port 3001, basePath /admin)
└── packages/
    └── shared/  # Shared TypeScript types & utilities
```

### Tech Stack

| Layer | Stack |
|-------|-------|
| **API** | NestJS 10 · Prisma · PostgreSQL · Redis · Socket.io · Passport/JWT |
| **Web & Admin** | Next.js 16 (App Router, Turbopack) · React 18 · TailwindCSS · SWR · Zustand · Framer Motion · Recharts |
| **Auth** | JWT access + rotating refresh tokens, token-version gate, TOTP 2FA |
| **Wallet** | Atomic ledger with exposure engine and optimistic concurrency |
| **Provably fair** | HMAC-SHA256 (server seed + client seed + nonce) |

---

## Features

### 🎰 Casino (in-house games)
Coinflip · Crash · Dice · Mines · Plinko · Pump (Balloon) · Roulette · Towers · Slots · Lottery · **Chicken Road** — all provably fair, with live bet feeds, multi-ball/auto-play where applicable, and per-game admin config (min/max bet, RTP/risk, force-win/loss controls).

### 🏏 Sports Exchange
Back/lay markets with real-time odds, fancy/bookmaker/session markets, exposure & liability tracking, settlement and void handling.

### 👤 Player Account
- **Wallet** — balance, exposure, bonus, available
- **Deposit** — UPI / Bank Transfer / Crypto with QR + copy-to-clipboard, quick amounts (admin-configurable payment details)
- **Withdraw** — saved payout methods, "Max" balance, request queue
- **Security & 2FA** — enable/disable TOTP (QR + manual key), change password, **active session management** ("sign out all devices")
- **VIP & loyalty tiers**, bets history, wallet statement, notifications

### 🛠️ Admin Panel (22 sections)
Dashboard · Users · All Bets · Casino Bets · Deposits · Withdrawals · Markets · VIP · Bonuses · Affiliates · Support · Live Risk · Monitoring · Provably Fair · Reports · Announcements · Payment Methods · API Keys · Admin Roles · Security Center · Audit Logs · Settings.

Includes wallet adjustments, betting limits, role-based access (6-tier hierarchy: Super Admin → Admin → Super Master → Master → Agent → User), promo codes, in-house game management, real-time monitoring (sessions, CPU/memory gauges), and live exposure/risk.

### 🔐 Security
- JWT access tokens with a per-user **token-version gate** — bumping the version (on "sign out all" or password change) **instantly invalidates** every other device's access token, not just refresh tokens.
- Rotating refresh tokens stored hashed; per-session revocation.
- TOTP 2FA (Google Authenticator compatible).
- Admin audit logging of sensitive actions.

---

## Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 15+
- Redis 7+
- pnpm 9+

### Install & Run

```bash
git clone https://github.com/cyberwithsaif/bettingluxuryexchange.git
cd bettingluxuryexchange/platform

# Install all workspace dependencies
pnpm install

# Configure the API environment
cp apps/api/.env.example apps/api/.env   # then edit values

# Generate Prisma client & push the schema
pnpm db:generate
pnpm --filter @exch/api exec prisma db push

# Dev — run all three apps in parallel
pnpm dev
#   or individually:
pnpm dev:api     # NestJS API   → http://localhost:4000
pnpm dev:web     # Player site  → http://localhost:3000
pnpm dev:admin   # Admin panel  → http://localhost:3001/admin
```

### Production build

```bash
pnpm build       # builds api + web + admin (pnpm -r run build)
```

---

## URLs

| Service | URL |
|---------|-----|
| **Player Web App** | http://localhost:3000 |
| **Admin Panel** | http://localhost:3001/admin |
| **API Server** | http://localhost:4000/api |

> The admin app runs under a `/admin` basePath. Casino API routes are prefixed `casino/`; with the global `/api` prefix a full route looks like `/api/casino/towers/active`.

---

## Environment Variables

```env
# apps/api/.env
DATABASE_URL=postgresql://user:pass@localhost:5432/exch_platform
REDIS_URL=redis://127.0.0.1:6379
API_PORT=4000

JWT_ACCESS_SECRET=your-32-char-access-secret
JWT_REFRESH_SECRET=your-32-char-refresh-secret
JWT_ACCESS_TTL=86400        # 24 hours
JWT_REFRESH_TTL=2592000     # 30 days

BOOTSTRAP_SUPERADMIN_USERNAME=superadmin
BOOTSTRAP_SUPERADMIN_PASSWORD=change-me-on-first-login

CORS_ORIGINS=http://localhost:3000,http://localhost:3001
```

> ⚠️ Use strong secrets and change the bootstrap admin password immediately in any non-local environment.

---

## Key Scripts

```bash
pnpm dev                # run api + web + admin in parallel
pnpm build              # build all apps
pnpm lint               # lint all apps

pnpm db:generate        # prisma generate
pnpm db:migrate         # prisma migrate
pnpm db:seed            # seed initial data

# Currency is formatted as ₹ with the en-IN locale.
```

---

## Deployment

Apps run under **PM2 (cluster mode)** behind **nginx**, which reverse-proxies:
`/` → web (`:3000`), `/admin` → admin (`:3001`), `/api` → API (`:4000`), plus a Socket.io upgrade.

```bash
# On the server
git pull origin main
cd platform && pnpm install && pnpm build
pm2 restart exch-web exch-api exch-admin
```

Notes:
- Restart only the app you changed (`exch-web`, `exch-api`, or `exch-admin`).
- Disable nginx proxy caching for the `/admin` routes (the panel is dynamic).
- Run `prisma db push` after pulling schema changes.

---

## Performance & Conventions

- Banner/logo art is pre-compressed and served via Next.js image optimization (WebP/AVIF) with explicit `sizes`.
- Real-time balance, live bets, and monitoring stream over Socket.io (Redis pub/sub).
- Currency: `₹` with `en-IN` locale throughout.
- Mobile-first responsive layouts; casino games fit the viewport with dedicated mobile control bars.

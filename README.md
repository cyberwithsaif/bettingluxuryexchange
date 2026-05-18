# Future9 — White-Label Betting Exchange & Casino Platform

A modern, full-stack betting exchange + casino platform built from scratch. Features include cricket/football/tennis exchange with back-lay markets, fancy/bookmaker/session markets, a casino lobby with provider-agnostic launch + seamless-wallet callbacks, a multi-tier agent system (Super Admin → Agent → User), and a full admin panel.

> Theme: dark luxury — deep maroon / black / dark-red with orange-gradient highlights, glassmorphism, neon glow.

---

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 15+
- Redis 7+
- pnpm 9+

### Install & Run

```bash
# Clone the repo
git clone https://github.com/cyberwithsaif/bettingluxuryexchange.git
cd bettingluxuryexchange

# Install all dependencies
cd platform
pnpm install

# Configure environment (edit as needed)
cp apps/api/.env.example apps/api/.env

# Push DB schema
pnpm --filter @exch/api run db:push

# Build the API
pnpm --filter @exch/api run build

# Start all services
# Terminal 1 — API server
cd apps/api && node dist/main.js

# Terminal 2 — User web app
pnpm --filter @exch/web run dev

# Terminal 3 — Admin panel
pnpm --filter @exch/admin run dev
```

---

## 🌐 URLs

| Service | URL |
|---------|-----|
| **User Web App** | http://localhost:3000 |
| **Admin Panel** | http://localhost:3001 |
| **API Server** | http://localhost:4000/api |

---

## 🔑 Default Credentials

| Role | Username | Password |
|------|----------|----------|
| **Super Admin** | `superadmin` | `ChangeMe!Now2026` |
| **User (demo)** | `saif` | `Saif1234!` |

> ⚠️ Change all passwords immediately after first login in a production environment.

---

## 🏗️ Architecture

```
platform/
├── apps/
│   ├── api/          # NestJS REST API (port 4000)
│   ├── web/          # Next.js user frontend (port 3000)
│   └── admin/        # Next.js admin panel (port 3001)
└── packages/
    └── db/           # Prisma schema & migrations
```

### Tech Stack
- **API**: NestJS + Prisma + PostgreSQL + Redis + Socket.io
- **Frontend**: Next.js 14 (App Router) + TailwindCSS + SWR + Zustand
- **Auth**: JWT (8h access token + 30d refresh token) with auto-refresh
- **Wallet**: Atomic double-entry ledger with optimistic concurrency

---

## ✅ Features Built

| Subsystem | Status |
|-----------|--------|
| Wallet ledger (atomic, optimistic-concurrency, double-entry) | ✅ Built |
| Exposure engine (per-runner P/L, per-market worst-case) | ✅ Built |
| Betting engine (back/lay placement, settlement, void, fancy) | ✅ Built |
| Admin panel (users, deposits, withdrawals, markets, risk, API-keys, logs) | ✅ Built |
| Agent hierarchy (6 roles, parent-chain, partnership %) | ✅ Built |
| Casino lobby (provider-agnostic, seamless wallet callbacks) | ✅ Built |
| Deposit / Withdrawal flow (immediate deduction, refund on reject) | ✅ Built |
| Real-time balance updates (Socket.io pub/sub via Redis) | ✅ Built |
| 2FA (TOTP via QR code) | ✅ Built |
| Platform settings (banners, announcements, commission %) | ✅ Built |
| Auto JWT token refresh (no mid-session logouts) | ✅ Built |
| Password show/hide toggle on login pages | ✅ Built |

---

## 📋 Admin Panel Features

- **Users** — Create, edit, suspend, reset password, adjust wallet balance, set betting limits
- **Transactions** — Approve/reject deposits and withdrawals with instant ledger updates
- **Markets** — Manage sports markets, set odds, settle results, void bets
- **Casino** — Add/remove providers and games
- **Risk** — View open exposure across all markets
- **Reports** — P/L reports, bet history
- **Platform Settings** — Banners, announcements, commission rates
- **API Keys** — Manage third-party provider credentials

---

## 🔐 Environment Variables

```env
# apps/api/.env
DATABASE_URL=postgresql://user:pass@localhost:5432/exch_platform
REDIS_URL=redis://127.0.0.1:6379
API_PORT=4000

JWT_ACCESS_SECRET=your-32-char-secret
JWT_REFRESH_SECRET=your-32-char-refresh-secret
JWT_ACCESS_TTL=28800       # 8 hours
JWT_REFRESH_TTL=2592000    # 30 days

BOOTSTRAP_SUPERADMIN_USERNAME=superadmin
BOOTSTRAP_SUPERADMIN_PASSWORD=ChangeMe!Now2026

CORS_ORIGINS=http://localhost:3000,http://localhost:3001
```

---

## 📦 Key Scripts

```bash
# Build API
pnpm --filter @exch/api run build

# Database operations
pnpm --filter @exch/api run db:push      # Push schema changes
pnpm --filter @exch/api run db:migrate   # Run migrations
pnpm --filter @exch/api run db:seed      # Seed initial data

# Lint & type check
pnpm --filter @exch/api run lint
pnpm --filter @exch/web run type-check
```

---

## 🛠️ Recent Changes (v1.1)

- ✅ Fixed JWT token auto-refresh (no more 401 logouts after 15 minutes)
- ✅ Extended JWT access token TTL to 8 hours
- ✅ Fixed withdrawal flow: balance deducted immediately on request
- ✅ Fixed rejection flow: balance refunded instantly via ADMIN_CREDIT
- ✅ Fixed user edit/password-reset endpoints (PATCH /users/:id)
- ✅ Fixed Prisma schema errors in Casino and Admin services
- ✅ Added password show/hide eye toggle to all login pages
- ✅ Added login disable toggle to admin panel
- ✅ Fixed balance display in withdraw/deposit pages
- ✅ Fixed username display (was hardcoded "Demo", now shows real user)

# ---------- build ----------
FROM node:20-alpine AS builder
WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

COPY pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile=false

COPY packages/shared packages/shared
COPY apps/api apps/api

RUN pnpm --filter @exch/api prisma:generate
RUN pnpm --filter @exch/api build

# ---------- runtime ----------
FROM node:20-alpine AS runner
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

ENV NODE_ENV=production

COPY --from=builder /repo .

EXPOSE 4000
CMD ["sh", "-lc", "pnpm --filter @exch/api prisma:deploy && node apps/api/dist/main.js"]

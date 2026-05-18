FROM node:20-alpine AS builder
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

COPY pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/admin/package.json apps/admin/
RUN pnpm install --frozen-lockfile=false

COPY packages/shared packages/shared
COPY apps/admin apps/admin
RUN pnpm --filter @exch/admin build

FROM node:20-alpine AS runner
WORKDIR /repo
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
COPY --from=builder /repo .
EXPOSE 3001
CMD ["sh", "-lc", "pnpm --filter @exch/admin start"]

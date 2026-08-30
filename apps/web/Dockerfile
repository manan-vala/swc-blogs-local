# Build context is the repo root — see apps/api/Dockerfile for the
# matching turbo-prune pattern (design doc §10).

FROM node:20-alpine AS base
RUN corepack enable

FROM base AS pruner
WORKDIR /app
RUN npm install -g turbo
COPY . .
RUN turbo prune --docker --scope=@swc-blogs/web

FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm --filter @swc-blogs/db generate
RUN pnpm --filter @swc-blogs/web build

FROM base AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 webuser
COPY --from=installer /app/apps/web/.next/standalone ./
COPY --from=installer /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=installer /app/apps/web/public ./apps/web/public
USER webuser
EXPOSE 3000
# single instance — no cluster mode, no replicas (§10/§11: ISR cache is per-process)
CMD ["node", "apps/web/server.js"]

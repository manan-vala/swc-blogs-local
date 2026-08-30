# Build context is the repo root (see design doc §10) — this Dockerfile
# expects `turbo prune --docker --scope=@swc-blogs/api` to have produced
# ./out/json (manifests, for a cacheable install layer) and ./out/full
# (source) before `docker build` runs, e.g. via a wrapper script or CI step.

FROM node:20-alpine AS base
RUN corepack enable

FROM base AS pruner
WORKDIR /app
RUN npm install -g turbo
COPY . .
RUN turbo prune --docker --scope=@swc-blogs/api

FROM base AS installer
WORKDIR /app
# Manifests only first — keeps this layer cached across source-only edits.
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm --filter @swc-blogs/db generate
RUN pnpm --filter @swc-blogs/api build

FROM base AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 apiuser
COPY --from=installer /app .
USER apiuser
EXPOSE 4000
CMD ["node", "apps/api/dist/index.js"]

# SWC Blogs

Institute clubs and boards write in Notion; this syncs and serves it at
`swc.iitg.ac.in/blogs`. Full architecture, reasoning, and the failure
modes to design around live in the design doc — see
`../swc-blogs-design.html` (also published as a Claude Artifact; ask
whoever scaffolded this repo for the link) — read that before making
architectural changes, not just this README.

## Layout

```
apps/
  web/    Next.js — public pages (static/ISR) + dashboard + admin UI
  api/    Express 5 — auth, CRUD, publish, Notion sync worker, cron
packages/
  db/     Prisma schema, migrations, generated client
  shared/ zod schemas, accent/pattern tokens, domain types
  config/ shared tsconfig
```

## Getting started

```bash
pnpm install
cp .env.example .env        # fill in real values — see comments inline
pnpm db:generate
pnpm db:migrate              # then apply packages/db/prisma/migrations_manual/001_fulltext_search.sql once, by hand
pnpm --filter @swc-blogs/db exec tsx prisma/seed.ts you@iitg.ac.in "Your Name"
pnpm dev                     # runs web + api together via turbo
```

## Testing

```bash
pnpm test                    # unit tests, no external services needed
```

The sync pipeline's `resolveInternalPageSlug` also has an integration
suite that runs against a real Postgres instead of a fake resolver —
skipped automatically unless `DATABASE_URL` is set:

```bash
docker run -d -p 55432:5432 -e POSTGRES_PASSWORD=postgres postgres:16
DATABASE_URL=postgresql://postgres:postgres@localhost:55432/postgres \
  pnpm db:migrate
DATABASE_URL=postgresql://postgres:postgres@localhost:55432/postgres \
  pnpm --filter @swc-blogs/api test
```

## Deploying

```bash
docker compose up -d --build
```

Fill in TLS cert paths in `nginx/nginx.conf` first. `web` runs as a
single instance deliberately — do not add replicas or cluster mode
without reading the design doc's ISR-cache section first.

## Before this goes further than a scaffold

- [ ] Wire the institute SSO exchange in `apps/api/src/routes/auth.routes.ts`
- [ ] Pick and contrast-check the accent/pattern palette (`packages/shared/src/tokens.ts`)
- [ ] Build the dashboard and admin-login UI (currently stubs)
- [x] Notion→internal link rewriting pass in the sync service — `apps/api/src/services/link-rewrite.service.ts`
- [ ] Decide the deployment pipeline (design doc §13, still open)

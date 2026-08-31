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
pnpm --filter @swc-blogs/api create-superadmin you@iitg.ac.in "Your Name"
pnpm dev                     # runs web + api together via turbo
```

The `create-superadmin` script is also the reset path — there's no
public password reset by design (§7). Run it again against an existing
email to replace their password, TOTP secret, and backup codes; it's
the only way back in if a maintainer loses their phone with no backup
codes left.

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

- [ ] Wire the institute SSO exchange in `apps/api/src/routes/auth.routes.ts` — both endpoints correctly 501 until then; the exchange itself needs IITG's actual protocol decided first (CAS vs OAuth2/OIDC — §13, still open)
- [ ] Pick and contrast-check the accent/pattern palette (`packages/shared/src/tokens.ts`)
- [ ] Build the admin-login UI (still a stub) and the superadmin panel screens beyond whitelist/clubs/posts/sync/audit (§7's "Superadmins" and "Health" screens — no route to create a second superadmin yet, only the CLI)
- [x] Notion→internal link rewriting pass in the sync service — `apps/api/src/services/link-rewrite.service.ts`
- [x] Superadmin auth end-to-end — bootstrap/reset CLI (`apps/api/src/cli/create-superadmin.ts`), TOTP enrolment with a mandatory live-code check, real escalating account lockout, and backup-code login — see `apps/api/src/services/auth.service.ts` and `apps/api/src/routes/auth.routes.ts`
- [ ] Decide the deployment pipeline (design doc §13, still open)

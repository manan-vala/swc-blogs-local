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
- [x] Notion→internal link rewriting pass in the sync service — `apps/api/src/services/link-rewrite.service.ts`
- [x] Superadmin auth end-to-end — bootstrap/reset CLI (`apps/api/src/cli/create-superadmin.ts`), TOTP enrolment with a mandatory live-code check, real escalating account lockout, and backup-code login — see `apps/api/src/services/auth.service.ts` and `apps/api/src/routes/auth.routes.ts`
- [x] Admin login UI — two-step password → TOTP/backup-code form (`apps/web/src/components/admin/AdminLoginForm.tsx`) plus a minimal gated `/admin` landing page and sign-out
- [x] Superadmin panel core — Whitelist, Clubs, Posts (oversight + takedown + forced re-sync), Sync logs, and Audit trail screens under `apps/web/src/app/admin/*`, backed by `apps/api/src/routes/admin.routes.ts`. Club logo upload isn't wired (no media-upload endpoint exists yet); "correct post metadata" beyond takedown/re-sync is deferred too.
- [x] Superadmins screen (§7) — create (same mandatory-live-code TOTP enrolment as the CLI, now over HTTP via a signed enrolToken instead of a prompt loop), disable/enable, reset password, re-enrol TOTP, reissue backup codes. `apps/web/src/app/admin/users/page.tsx`, `apps/api/src/routes/admin.routes.ts`. The CLI remains the only way to create the *first* superadmin (bootstrapping needs a route to exist before it can be logged into).
- [x] Health screen (§7) — Notion token validity and media directory size (live checks in `apps/api/src/services/health.service.ts`, since only the api container has the token and the media volume), plus last-sync-per-club, recent failures, and a 24h rate-limited count read straight from Postgres. `apps/web/src/app/admin/health/page.tsx`. All six §7 panel screens now exist.
- [ ] Decide the deployment pipeline (design doc §13, still open)

## Fixed along the way

A few things surfaced while actually running both services together for
the first time rather than just typechecking them separately — worth
knowing about since they'd otherwise resurface as confusing one-offs:

- **`packages/shared` and `packages/db` now declare `"type": "module"`.**
  Without it, Node defaults an unmarked package to CommonJS; a `tsx
  src/index.ts` entrypoint (i.e. `pnpm dev` / `pnpm start`, not just the
  test suite) then only exposes `packages/shared`'s barrel export as an
  opaque `default`/`module.exports` blob instead of its named exports,
  crashing on the very first import.
- **`apps/web`'s tsconfig now sets `lib: ["ES2022", "DOM", "DOM.Iterable"]`.**
  The shared `tsconfig.base.json` only sets `["ES2022"]` — correct for
  the Node services, but a browser app with no DOM lib fails to
  typecheck on `window` and on ordinary element properties like
  `input.value`.
- **`next.config.js` now sets `transpilePackages` and a webpack
  `resolve.extensionAlias`.** `packages/shared`'s internal imports use
  explicit `.js` extensions on `.ts` files — required by the Node
  services' NodeNext module resolution — which webpack can't resolve on
  its own; without this, `next dev` 404s on the very first page that
  touches `@swc-blogs/shared`.
- **`DEV_CORS_ORIGIN`** — see `.env.example`.
- **Every page/route reading `params` or `searchParams` now awaits them.**
  Next.js 15 made both a `Promise` rather than a plain object; the
  existing pages (and this session's own first drafts) used the
  pre-15 synchronous shape, which `tsc` only caught once `.next/types`
  existed to check against — meaning a real `next build` would have
  failed on every one of them. Fixed across `[slug]`, `tag/[slug]`,
  `club/[slug]`, `preview/[token]`, `search`, and both new `admin`
  pages that take a query filter.
- **`apps/web/src/app/og/[slug]/route.tsx` rewritten as a real Route
  Handler.** It was written as Next's `opengraph-image.tsx` special-file
  convention (default export, `alt`/`size`/`contentType` exports) but
  placed at a `route.tsx` path and referenced by a manually-built URL in
  `[slug]/page.tsx`'s metadata — the two conventions don't mix, so the
  route had no valid HTTP method handler and 404'd for every request.
  Same `.next/types` check caught it. Now exports `GET`.

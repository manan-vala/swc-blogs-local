import { z } from "zod";

/**
 * Fail fast on a missing/malformed env var rather than discovering it
 * mid-request. Every secret this service touches is listed here once.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4000),

  DATABASE_URL: z.string().min(1),

  // Notion — see design doc §8. Single internal integration token,
  // owned per §11's "Notion token has no owner" card — document who
  // holds this in the team handover doc, not just here.
  NOTION_TOKEN: z.string().min(1),
  NOTION_POSTS_DATABASE_ID: z.string().min(1),
  NOTION_TEMPLATE_PAGE_ID: z.string().min(1),

  // Institute SSO — club secretary sign-in (§7)
  SSO_CLIENT_ID: z.string().min(1),
  SSO_CLIENT_SECRET: z.string().min(1),
  SSO_CALLBACK_URL: z.string().url(),

  // Superadmin session (§7) — separate cookie/secret from the SSO session
  SESSION_SECRET: z.string().min(32),

  // TOTP secret encryption at rest (§7)
  TOTP_ENCRYPTION_KEY: z.string().min(32),

  // Cross-service revalidate call to apps/web (§4). Internal container
  // URL, called directly on the Docker network — bypasses nginx.
  // MUST include the /blogs basePath: Next.js prefixes every route it
  // serves, Route Handlers included, e.g. "http://web:3000/blogs".
  WEB_URL: z.string().url(),
  REVALIDATE_SECRET: z.string().min(16),

  MEDIA_DIR: z.string().default("/app/media"),

  // Local dev only: `pnpm dev` runs web (:3000) and api (:4000) as two
  // origins with no nginx in front of them, but every browser call this
  // API serves — the SSO callback aside — is a credentialed fetch
  // (cookies). Without an explicit Access-Control-Allow-Origin the
  // browser silently drops every one of them at the CORS preflight, no
  // matter how correct the route itself is. Unset in production: nginx
  // same-origins everything under /blogs there, so no CORS is involved
  // at all and this middleware (see lib/cors.ts) never engages.
  DEV_CORS_ORIGIN: z.string().url().optional(),
});

export const env = envSchema.parse(process.env);

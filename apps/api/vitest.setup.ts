/**
 * Every apps/api module transitively imports lib/env.ts, which parses
 * process.env eagerly and throws on anything missing — so even a
 * pure-logic unit test needs every secret this service touches set
 * just to import the file under test. These are inert placeholders,
 * `??`-defaulted in so a real .env or CI-provided value always wins.
 *
 * DATABASE_URL is deliberately NOT defaulted the same way as the rest:
 * several integration suites gate themselves on whether it was actually
 * provided, so `pnpm test` stays dependency-free by default — no
 * Postgres required. Capture that *before* env.ts ever runs, so those
 * suites can tell "a real database was configured" apart from "env.ts
 * just needed something present here to not throw."
 */
process.env.HAS_REAL_DATABASE_URL = process.env.DATABASE_URL ? "1" : "";
process.env.DATABASE_URL ??= "postgresql://placeholder/unused_unless_HAS_REAL_DATABASE_URL_is_set";

const defaults: Record<string, string> = {
  NODE_ENV: "test",
  NOTION_TOKEN: "test-notion-token",
  NOTION_POSTS_DATABASE_ID: "test-database-id",
  NOTION_TEMPLATE_PAGE_ID: "test-template-id",
  SSO_CLIENT_ID: "test-client-id",
  SSO_CLIENT_SECRET: "test-client-secret",
  SSO_CALLBACK_URL: "https://example.invalid/callback",
  SESSION_SECRET: "test-session-secret-at-least-32-bytes-long",
  TOTP_ENCRYPTION_KEY: "test-totp-encryption-key-32-bytes!!",
  WEB_URL: "http://localhost:3000/blogs",
  REVALIDATE_SECRET: "test-revalidate-secret",
};

for (const [key, value] of Object.entries(defaults)) {
  process.env[key] ??= value;
}

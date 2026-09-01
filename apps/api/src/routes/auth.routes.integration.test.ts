import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";

/**
 * Integration coverage for the SSO auth surface — see auth.routes.ts's
 * module doc for the bug this replaces: the previous /sso/callback
 * trusted req.query.email as a verified identity, so hitting the URL
 * with a whitelisted address attached minted a real session with no
 * SSO involved. The route-level tests below exist specifically to
 * catch a regression back to that shape — an attacker-controlled query
 * string must never be enough to get a session cookie, whatever the
 * route eventually does with a *verified* email.
 *
 * Skipped unless DATABASE_URL is set — see notion-sync.service's
 * integration test for how to point this at a real Postgres.
 */
const describeIfDb = process.env.HAS_REAL_DATABASE_URL ? describe : describe.skip;

describeIfDb("SSO auth (integration)", () => {
  let prisma: typeof import("@swc-blogs/db").prisma;
  let admitClubSecretary: typeof import("./auth.routes.js").admitClubSecretary;
  let verifySessionToken: typeof import("@swc-blogs/shared").verifySessionToken;
  let clubId: string;
  let baseUrl: string;
  let server: Server;

  beforeAll(async () => {
    ({ prisma } = await import("@swc-blogs/db"));
    ({ admitClubSecretary } = await import("./auth.routes.js"));
    ({ verifySessionToken } = await import("@swc-blogs/shared"));
    const { createApp } = await import("../app.js");

    const club = await prisma.club.create({
      data: { name: "Test Club", slug: `test-club-${Date.now()}` },
    });
    clubId = club.id;

    server = createApp().listen(0);
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("Failed to bind test server.");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.user.deleteMany({ where: { clubId } });
    await prisma.whitelist.deleteMany({ where: { clubId } });
    await prisma.club.delete({ where: { id: clubId } });
    await prisma.$disconnect();
  });

  describe("admitClubSecretary — the whitelist-check-and-issue half, given an already-verified email", () => {
    it("issues a session for a whitelisted email and creates the user", async () => {
      const email = `secy-${crypto.randomUUID()}@iitg.ac.in`;
      await prisma.whitelist.create({ data: { email, clubId } });

      const result = await admitClubSecretary(email);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.clubId).toBe(clubId);
      const claims = await verifySessionToken(result.token, process.env.SESSION_SECRET!);
      expect(claims?.role).toBe("CLUB_SECY");
      expect(claims?.clubId).toBe(clubId);

      const user = await prisma.user.findUnique({ where: { email } });
      expect(user?.role).toBe("CLUB_SECY");
      expect(user?.provider).toBe("SSO");
    });

    it("updates lastLoginAt on a repeat login rather than duplicating the user", async () => {
      const email = `secy-${crypto.randomUUID()}@iitg.ac.in`;
      await prisma.whitelist.create({ data: { email, clubId } });

      const first = await admitClubSecretary(email);
      const second = await admitClubSecretary(email);
      expect(first.ok && second.ok).toBe(true);

      const users = await prisma.user.findMany({ where: { email } });
      expect(users).toHaveLength(1);
      expect(users[0]!.lastLoginAt).not.toBeNull();
    });

    it("rejects an email with no whitelist entry", async () => {
      const result = await admitClubSecretary(`nobody-${crypto.randomUUID()}@iitg.ac.in`);
      expect(result).toEqual({ ok: false, reason: "not-whitelisted" });
    });

    it("rejects a revoked whitelist entry", async () => {
      const email = `revoked-${crypto.randomUUID()}@iitg.ac.in`;
      await prisma.whitelist.create({ data: { email, clubId, revokedAt: new Date() } });

      const result = await admitClubSecretary(email);
      expect(result).toEqual({ ok: false, reason: "not-whitelisted" });
    });
  });

  /**
   * Every test below asserts the absence of a *session* cookie
   * specifically, not the absence of all Set-Cookie headers: /sso/login
   * legitimately sets a short-lived nonce cookie, and the callback
   * legitimately clears it. Only swc_blogs_session means "you are now
   * signed in as someone."
   */
  const sessionCookie = (res: globalThis.Response) =>
    (res.headers.get("set-cookie") ?? "").match(/swc_blogs_session=([^;]*)/)?.[1] || null;

  describe("routes fail closed — no session from unverified request input", () => {
    it("GET /sso/login redirects to Microsoft and sets only a nonce cookie", async () => {
      const res = await fetch(`${baseUrl}/api/auth/sso/login`, { redirect: "manual" });
      expect(res.status).toBe(302);

      const location = new URL(res.headers.get("location")!);
      expect(location.host).toBe("login.microsoftonline.com");
      expect(location.searchParams.get("response_type")).toBe("code");
      // §7's shared-machine reasoning — see buildAuthorizeUrl's comment.
      expect(location.searchParams.get("prompt")).toBe("login");
      expect(location.searchParams.get("state")).toBeTruthy();

      expect(res.headers.get("set-cookie")).toMatch(/swc_blogs_sso_nonce=/);
      expect(sessionCookie(res)).toBeNull();
    });

    it("GET /sso/callback with no query at all: back to login with an error, no session", async () => {
      const res = await fetch(`${baseUrl}/api/auth/sso/callback`, { redirect: "manual" });
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toMatch(/\/blogs\/login\?error=/);
      expect(sessionCookie(res)).toBeNull();
    });

    it("GET /sso/callback?email=<whitelisted address> issues no session — the original bug this guards against", async () => {
      const email = `secy-${crypto.randomUUID()}@iitg.ac.in`;
      await prisma.whitelist.create({ data: { email, clubId } });

      const res = await fetch(`${baseUrl}/api/auth/sso/callback?email=${encodeURIComponent(email)}`, {
        redirect: "manual",
      });
      expect(sessionCookie(res)).toBeNull();
      // And no user was created for that address as a side effect.
      expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
    });

    it("GET /sso/callback with a code but no state is refused before any token exchange", async () => {
      const res = await fetch(`${baseUrl}/api/auth/sso/callback?code=fake-authorization-code`, {
        redirect: "manual",
      });
      expect(res.headers.get("location")).toMatch(/error=expired/);
      expect(sessionCookie(res)).toBeNull();
    });

    it("a validly-signed state with no matching nonce cookie is refused — the CSRF guard", async () => {
      const { signSsoStateToken } = await import("@swc-blogs/shared");
      const state = await signSsoStateToken(
        { nonce: "a-nonce-this-browser-never-received", redirect: "/blogs/dashboard" },
        process.env.SESSION_SECRET!
      );

      const res = await fetch(
        `${baseUrl}/api/auth/sso/callback?code=fake-authorization-code&state=${encodeURIComponent(state)}`,
        { redirect: "manual" }
      );
      expect(res.headers.get("location")).toMatch(/error=expired/);
      expect(sessionCookie(res)).toBeNull();
    });

    it("a state signed with the wrong secret is refused", async () => {
      const { signSsoStateToken } = await import("@swc-blogs/shared");
      const forged = await signSsoStateToken(
        { nonce: "attacker-chosen", redirect: "/blogs/dashboard" },
        "a-completely-different-secret-value-32b"
      );

      const res = await fetch(
        `${baseUrl}/api/auth/sso/callback?code=fake&state=${encodeURIComponent(forged)}`,
        {
          redirect: "manual",
          headers: { cookie: "swc_blogs_sso_nonce=attacker-chosen" },
        }
      );
      expect(res.headers.get("location")).toMatch(/error=expired/);
      expect(sessionCookie(res)).toBeNull();
    });
  });
});

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

  describe("routes fail closed — no session from unverified request input", () => {
    it("GET /api/auth/sso/login is not wired (501), no cookie", async () => {
      const res = await fetch(`${baseUrl}/api/auth/sso/login`);
      expect(res.status).toBe(501);
      expect(res.headers.get("set-cookie")).toBeNull();
    });

    it("GET /api/auth/sso/callback is not wired (501) with no query at all", async () => {
      const res = await fetch(`${baseUrl}/api/auth/sso/callback`);
      expect(res.status).toBe(501);
      expect(res.headers.get("set-cookie")).toBeNull();
    });

    it("GET /api/auth/sso/callback?email=<whitelisted address> still 501s — the regression this guards against", async () => {
      const email = `secy-${crypto.randomUUID()}@iitg.ac.in`;
      await prisma.whitelist.create({ data: { email, clubId } });

      const res = await fetch(`${baseUrl}/api/auth/sso/callback?email=${encodeURIComponent(email)}`, {
        redirect: "manual",
      });
      expect(res.status).toBe(501);
      expect(res.headers.get("set-cookie")).toBeNull();
    });
  });
});

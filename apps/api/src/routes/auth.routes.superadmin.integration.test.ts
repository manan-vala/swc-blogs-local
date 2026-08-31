import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authenticator } from "otplib";
import type { Server } from "node:http";

/**
 * End-to-end coverage for the superadmin login flow, against a real
 * Postgres and a real running Express app — password -> pendingToken ->
 * TOTP or backup code -> session cookie. auth.service.test.ts already
 * covers the lockout math and crypto helpers as pure functions; this
 * file is about whether the routes actually wire them together
 * correctly (right status codes, right cookie behaviour, right DB
 * state), not re-proving the math.
 *
 * All the POST routes here share one IP-keyed rate limiter (10 requests
 * per 15 minutes, see rateLimit.ts's authRateLimit) across every test
 * in this file, since they hit one real server instance — kept
 * deliberately under budget rather than exercising the lockout
 * threshold itself over HTTP.
 *
 * Skipped unless DATABASE_URL is set — see notion-sync.service's
 * integration test for how to point this at a real Postgres.
 */
const describeIfDb = process.env.HAS_REAL_DATABASE_URL ? describe : describe.skip;

describeIfDb("Superadmin login (integration)", () => {
  let prisma: typeof import("@swc-blogs/db").prisma;
  let auth: typeof import("../services/auth.service.js");
  let verifySessionToken: typeof import("@swc-blogs/shared").verifySessionToken;
  let baseUrl: string;
  let server: Server;

  const PASSWORD = "correct horse battery staple";

  beforeAll(async () => {
    ({ prisma } = await import("@swc-blogs/db"));
    auth = await import("../services/auth.service.js");
    ({ verifySessionToken } = await import("@swc-blogs/shared"));
    const { createApp } = await import("../app.js");

    server = createApp().listen(0);
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("Failed to bind test server.");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();
  });

  /** A fresh superadmin with a known password and a known TOTP secret,
   *  already enrolled — mirrors what create-superadmin.ts leaves behind. */
  async function makeSuperadmin() {
    const email = `admin-${crypto.randomUUID()}@iitg.ac.in`;
    const secret = auth.generateTotpSecret();
    const user = await prisma.user.create({
      data: {
        email,
        name: "Test Admin",
        role: "SUPERADMIN",
        provider: "PASSWORD",
        passwordHash: await auth.hashPassword(PASSWORD),
        passwordSetAt: new Date(),
        totpSecret: auth.encryptTotpSecret(secret),
        totpEnabledAt: new Date(),
      },
    });
    return { email, secret, userId: user.id };
  }

  function currentTotpCode(secret: string): string {
    return authenticator.generate(secret);
  }

  async function login(email: string) {
    const res = await fetch(`${baseUrl}/api/auth/admin/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    return { res, body: (await res.json()) as { pendingToken?: string; error?: string } };
  }

  it("full TOTP login: correct password + correct code sets a session cookie and clears failedLogins", async () => {
    const { email, secret, userId } = await makeSuperadmin();

    const { res: loginRes, body: loginBody } = await login(email);
    expect(loginRes.status).toBe(200);
    expect(loginBody.pendingToken).toBeTruthy();

    const totpRes = await fetch(`${baseUrl}/api/auth/admin/verify-totp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pendingToken: loginBody.pendingToken, code: currentTotpCode(secret) }),
    });
    expect(totpRes.status).toBe(200);
    const cookie = totpRes.headers.get("set-cookie");
    expect(cookie).toMatch(/swc_blogs_session=/);

    const token = cookie!.match(/swc_blogs_session=([^;]+)/)![1]!;
    const claims = await verifySessionToken(token, process.env.SESSION_SECRET!);
    expect(claims).toEqual({ sub: userId, role: "SUPERADMIN", clubId: null });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.failedLogins).toBe(0);
    expect(user.lockedUntil).toBeNull();
    expect(user.totpLastStep).not.toBeNull();
  });

  it("wrong password: generic error, no pendingToken, and it counts against the lockout", async () => {
    const { email, userId } = await makeSuperadmin();

    const res = await fetch(`${baseUrl}/api/auth/admin/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "definitely wrong" }),
    });
    const body = (await res.json()) as { error: string; pendingToken?: string };

    expect(res.status).toBe(401);
    expect(body.error).toBe("Incorrect email or password."); // same copy as a wrong email — §7
    expect(body.pendingToken).toBeUndefined();

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.failedLogins).toBe(1);
  });

  it("correct password but wrong TOTP code: rejected, no cookie, no session issued", async () => {
    const { email, userId } = await makeSuperadmin();
    const { body: loginBody } = await login(email);

    const res = await fetch(`${baseUrl}/api/auth/admin/verify-totp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pendingToken: loginBody.pendingToken, code: "000000" }),
    });

    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.failedLogins).toBe(1);
  });

  it("a garbage pendingToken is rejected on the TOTP step, not treated as any particular user", async () => {
    const res = await fetch(`${baseUrl}/api/auth/admin/verify-totp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pendingToken: "not-a-real-token", code: "123456" }),
    });
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("a currently-locked account is refused at the password step without checking the password", async () => {
    const { email, userId } = await makeSuperadmin();
    await prisma.user.update({ where: { id: userId }, data: { lockedUntil: new Date(Date.now() + 60_000) } });

    const { res } = await login(email); // right password, but locked
    expect(res.status).toBe(423);
  });

  it("backup-code login succeeds, sets a cookie, and the same code is single-use", async () => {
    const email = `admin-${crypto.randomUUID()}@iitg.ac.in`;
    const plainCode = auth.generateBackupCodes(1)[0]!;
    const user = await prisma.user.create({
      data: {
        email,
        name: "Test Admin",
        role: "SUPERADMIN",
        provider: "PASSWORD",
        passwordHash: await auth.hashPassword(PASSWORD),
        passwordSetAt: new Date(),
        backupCodes: { create: { codeHash: await auth.hashBackupCode(plainCode) } },
      },
    });

    const { body: loginBody } = await login(email);

    const res = await fetch(`${baseUrl}/api/auth/admin/verify-backup-code`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pendingToken: loginBody.pendingToken, code: plainCode }),
    });
    const body = (await res.json()) as { ok: boolean; backupCodesRemaining: number };

    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/swc_blogs_session=/);
    expect(body.backupCodesRemaining).toBe(0);

    const codes = await prisma.backupCode.findMany({ where: { userId: user.id } });
    expect(codes).toHaveLength(1);
    expect(codes[0]!.usedAt).not.toBeNull(); // spent — verify-backup-code's own DB effect
  });
});

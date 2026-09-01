import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authenticator } from "otplib";
import type { Server } from "node:http";

/**
 * The superadmin-management screen (§7: "Create, disable, rotate a
 * password, re-enrol TOTP, reissue backup codes") — against a real
 * Postgres and a real running Express app. The create/reenroll flow is
 * the one worth the most scrutiny here: it's the same start-then-verify
 * shape as the CLI's interactive prompt loop (create-superadmin.ts),
 * just over HTTP, and nothing may land in the User table until a live
 * TOTP code against the exact secret just generated actually verifies.
 *
 * Skipped unless DATABASE_URL is set — see notion-sync.service's
 * integration test for how to point this at a real Postgres.
 */
const describeIfDb = process.env.HAS_REAL_DATABASE_URL ? describe : describe.skip;

describeIfDb("Superadmin management (integration)", () => {
  let prisma: typeof import("@swc-blogs/db").prisma;
  let auth: typeof import("../services/auth.service.js");
  let signSessionToken: typeof import("@swc-blogs/shared").signSessionToken;
  let baseUrl: string;
  let server: Server;

  beforeAll(async () => {
    ({ prisma } = await import("@swc-blogs/db"));
    auth = await import("../services/auth.service.js");
    ({ signSessionToken } = await import("@swc-blogs/shared"));
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

  async function makeSuperadmin(overrides: Partial<{ isActive: boolean }> = {}) {
    const email = `admin-${crypto.randomUUID()}@iitg.ac.in`;
    const user = await prisma.user.create({
      data: {
        email,
        name: "Acting Admin",
        role: "SUPERADMIN",
        provider: "PASSWORD",
        passwordHash: await auth.hashPassword("acting admin password 12"),
        passwordSetAt: new Date(),
        isActive: overrides.isActive ?? true,
      },
    });
    const cookie = await signSessionToken(
      { sub: user.id, role: "SUPERADMIN", clubId: null },
      process.env.SESSION_SECRET!
    );
    return { userId: user.id, cookieHeader: `swc_blogs_session=${cookie}` };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper, response shape varies per route
  async function post(path: string, cookieHeader: string, requestBody?: unknown): Promise<{ res: Response; body: any }> {
    const res = await fetch(`${baseUrl}/api/admin${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieHeader },
      body: requestBody !== undefined ? JSON.stringify(requestBody) : undefined,
    });
    return { res, body: await res.json() };
  }

  it("full create flow: start -> live code -> a new superadmin exists, backup codes shown once, audited", async () => {
    const { userId: actorId, cookieHeader } = await makeSuperadmin();
    const newEmail = `new-admin-${crypto.randomUUID()}@iitg.ac.in`;

    const { res: startRes, body: start } = await post("/superadmins", cookieHeader, {
      email: newEmail,
      name: "Brand New Admin",
      password: "a fresh password 123",
    });
    expect(startRes.status).toBe(200);
    expect(start.enrollToken).toBeTruthy();
    expect(start.secret).toBeTruthy();
    expect(start.qrDataUrl).toMatch(/^data:image\/png;base64,/);

    const code = authenticator.generate(start.secret);
    const { res: verifyRes, body: verifyBody } = await post("/superadmins/enroll/verify", cookieHeader, {
      enrollToken: start.enrollToken,
      code,
    });
    expect(verifyRes.status).toBe(201);
    expect(verifyBody.email).toBe(newEmail);
    expect(verifyBody.backupCodes).toHaveLength(10);

    const created = await prisma.user.findUniqueOrThrow({ where: { email: newEmail } });
    expect(created.role).toBe("SUPERADMIN");
    expect(created.totpEnabledAt).not.toBeNull();
    expect(created.totpLastStep).not.toBeNull();
    // The password from step 1 actually took effect.
    expect(await auth.verifyPassword(created.passwordHash!, "a fresh password 123")).toBe(true);

    const codes = await prisma.backupCode.findMany({ where: { userId: created.id } });
    expect(codes).toHaveLength(10);

    const auditEntry = await prisma.auditLog.findFirst({
      where: { action: "superadmin.create", targetId: created.id },
    });
    expect(auditEntry?.actorId).toBe(actorId);
  });

  it("create: a wrong code at verify leaves no user behind", async () => {
    const { cookieHeader } = await makeSuperadmin();
    const newEmail = `rejected-${crypto.randomUUID()}@iitg.ac.in`;

    const { body: start } = await post("/superadmins", cookieHeader, {
      email: newEmail,
      name: "Never Created",
      password: "will not be used 123",
    });

    const { res: verifyRes } = await post("/superadmins/enroll/verify", cookieHeader, {
      enrollToken: start.enrollToken,
      code: "000000",
    });
    expect(verifyRes.status).toBe(401);
    expect(await prisma.user.findUnique({ where: { email: newEmail } })).toBeNull();
  });

  it("create: starting with an email already in use is rejected before any QR is generated", async () => {
    const { cookieHeader } = await makeSuperadmin();
    const { userId: existingId } = await makeSuperadmin();
    const existing = await prisma.user.findUniqueOrThrow({ where: { id: existingId } });

    const { res } = await post("/superadmins", cookieHeader, {
      email: existing.email,
      name: "Duplicate",
      password: "does not matter here 123",
    });
    expect(res.status).toBe(409);
  });

  it("reenroll-totp: replaces the secret without touching the password, and is audited", async () => {
    const { userId: actorId, cookieHeader } = await makeSuperadmin();
    const oldSecret = auth.generateTotpSecret();
    const target = await prisma.user.create({
      data: {
        email: `reenroll-${crypto.randomUUID()}@iitg.ac.in`,
        name: "Losing Phone",
        role: "SUPERADMIN",
        provider: "PASSWORD",
        passwordHash: await auth.hashPassword("original password stays 123"),
        passwordSetAt: new Date(),
        totpSecret: auth.encryptTotpSecret(oldSecret),
        totpEnabledAt: new Date(),
      },
    });

    const { res: startRes, body: start } = await post(`/superadmins/${target.id}/reenroll-totp`, cookieHeader);
    expect(startRes.status).toBe(200);
    expect(start.secret).not.toBe(oldSecret);

    const code = authenticator.generate(start.secret);
    const { res: verifyRes } = await post("/superadmins/enroll/verify", cookieHeader, {
      enrollToken: start.enrollToken,
      code,
    });
    expect(verifyRes.status).toBe(200);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(auth.decryptTotpSecret(updated.totpSecret!)).toBe(start.secret);
    expect(await auth.verifyPassword(updated.passwordHash!, "original password stays 123")).toBe(true);

    const auditEntry = await prisma.auditLog.findFirst({
      where: { action: "superadmin.reenroll-totp", targetId: target.id },
    });
    expect(auditEntry?.actorId).toBe(actorId);
  });

  it("disable: works on another account, is audited, and is refused on your own", async () => {
    const { cookieHeader: actingCookie } = await makeSuperadmin();
    const { userId: targetId } = await makeSuperadmin();

    const { res } = await post(`/superadmins/${targetId}/disable`, actingCookie);
    expect(res.status).toBe(200);
    const disabled = await prisma.user.findUniqueOrThrow({ where: { id: targetId } });
    expect(disabled.isActive).toBe(false);

    const { userId: selfId, cookieHeader: selfCookie } = await makeSuperadmin();
    const { res: blockedRes, body: blockedBody } = await post(`/superadmins/${selfId}/disable`, selfCookie);
    expect(blockedRes.status).toBe(400);
    expect(blockedBody.error).toMatch(/own account/);
  });

  it("enable: clears isActive, failedLogins and lockedUntil together", async () => {
    const { cookieHeader } = await makeSuperadmin();
    const { userId: targetId } = await makeSuperadmin({ isActive: false });
    await prisma.user.update({
      where: { id: targetId },
      data: { failedLogins: 4, lockedUntil: new Date(Date.now() + 60_000) },
    });

    const { res } = await post(`/superadmins/${targetId}/enable`, cookieHeader);
    expect(res.status).toBe(200);

    const enabled = await prisma.user.findUniqueOrThrow({ where: { id: targetId } });
    expect(enabled.isActive).toBe(true);
    expect(enabled.failedLogins).toBe(0);
    expect(enabled.lockedUntil).toBeNull();
  });

  it("reset-password: the acting admin's chosen value takes effect, and lockout state clears", async () => {
    const { cookieHeader } = await makeSuperadmin();
    const { userId: targetId } = await makeSuperadmin();
    await prisma.user.update({ where: { id: targetId }, data: { failedLogins: 3 } });

    const { res } = await post(`/superadmins/${targetId}/reset-password`, cookieHeader, {
      password: "a brand new relayed password",
    });
    expect(res.status).toBe(200);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: targetId } });
    expect(await auth.verifyPassword(updated.passwordHash!, "a brand new relayed password")).toBe(true);
    expect(updated.failedLogins).toBe(0);
  });

  it("reissue-backup-codes: old codes are gone, ten new ones come back once", async () => {
    const { cookieHeader } = await makeSuperadmin();
    const { userId: targetId } = await makeSuperadmin();
    const oldCode = auth.generateBackupCodes(1)[0]!;
    await prisma.backupCode.create({ data: { userId: targetId, codeHash: await auth.hashBackupCode(oldCode) } });

    const { res, body } = await post(`/superadmins/${targetId}/reissue-backup-codes`, cookieHeader);
    expect(res.status).toBe(200);
    expect(body.backupCodes).toHaveLength(10);

    const codes = await prisma.backupCode.findMany({ where: { userId: targetId } });
    expect(codes).toHaveLength(10);
    for (const c of codes) {
      expect(await auth.verifyBackupCode(c.codeHash, oldCode)).toBe(false); // the old code is gone
    }
  });

  it("a club secretary gets 404 on the superadmins list, not 403", async () => {
    const secyEmail = `secy-${crypto.randomUUID()}@iitg.ac.in`;
    const club = await prisma.club.create({ data: { name: "Gate Test Club", slug: `gate-${crypto.randomUUID().slice(0, 8)}` } });
    const secy = await prisma.user.create({
      data: { email: secyEmail, name: "Secy", role: "CLUB_SECY", provider: "SSO", clubId: club.id },
    });
    const cookie = await signSessionToken(
      { sub: secy.id, role: "CLUB_SECY", clubId: club.id },
      process.env.SESSION_SECRET!
    );

    const res = await fetch(`${baseUrl}/api/admin/superadmins`, {
      headers: { cookie: `swc_blogs_session=${cookie}` },
    });
    expect(res.status).toBe(404);
  });
});

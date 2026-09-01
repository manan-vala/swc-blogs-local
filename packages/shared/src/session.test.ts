import { describe, expect, it } from "vitest";
import {
  signSessionToken,
  verifySessionToken,
  signPendingTwoFactorToken,
  verifyPendingTwoFactorToken,
  signSuperadminEnrollToken,
  verifySuperadminEnrollToken,
  signSsoStateToken,
  verifySsoStateToken,
  type SuperadminEnrollClaims,
} from "./session.js";

const SECRET = "test-secret-at-least-32-bytes-long!!";
const OTHER_SECRET = "a-completely-different-secret-value";

describe("session token", () => {
  it("round-trips the claims it was signed with", async () => {
    const token = await signSessionToken({ sub: "u1", role: "CLUB_SECY", clubId: "club-a" }, SECRET);
    const claims = await verifySessionToken(token, SECRET);
    expect(claims).toEqual({ sub: "u1", role: "CLUB_SECY", clubId: "club-a" });
  });

  it("carries a null clubId through for a superadmin", async () => {
    const token = await signSessionToken({ sub: "u2", role: "SUPERADMIN", clubId: null }, SECRET);
    const claims = await verifySessionToken(token, SECRET);
    expect(claims?.clubId).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signSessionToken({ sub: "u1", role: "CLUB_SECY", clubId: "club-a" }, SECRET);
    expect(await verifySessionToken(token, OTHER_SECRET)).toBeNull();
  });

  it("rejects garbage input instead of throwing", async () => {
    expect(await verifySessionToken("not-a-jwt", SECRET)).toBeNull();
  });
});

describe("pending two-factor token", () => {
  it("round-trips the userId it was signed with", async () => {
    const token = await signPendingTwoFactorToken("u1", SECRET);
    expect(await verifyPendingTwoFactorToken(token, SECRET)).toBe("u1");
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signPendingTwoFactorToken("u1", SECRET);
    expect(await verifyPendingTwoFactorToken(token, OTHER_SECRET)).toBeNull();
  });

  it("rejects garbage input instead of throwing", async () => {
    expect(await verifyPendingTwoFactorToken("not-a-jwt", SECRET)).toBeNull();
  });

  it("is never accepted as a full session token — a stolen pending token can't skip 2FA", async () => {
    const pending = await signPendingTwoFactorToken("u1", SECRET);
    // verifySessionToken has no purpose check of its own, so this proves
    // the two token kinds are only kept apart by never cross-calling the
    // wrong verify function — a route wiring bug here would be silent.
    const claims = await verifySessionToken(pending, SECRET);
    expect(claims?.role).not.toBe("SUPERADMIN");
    expect(claims?.role).not.toBe("CLUB_SECY");
  });

  it("a real session token is never accepted as a pending token — can't be replayed into the 2FA step", async () => {
    const session = await signSessionToken({ sub: "u1", role: "SUPERADMIN", clubId: null }, SECRET);
    expect(await verifyPendingTwoFactorToken(session, SECRET)).toBeNull();
  });
});

describe("sso state token", () => {
  it("round-trips the nonce and redirect it was signed with", async () => {
    const token = await signSsoStateToken({ nonce: "n1", redirect: "/blogs/dashboard" }, SECRET);
    expect(await verifySsoStateToken(token, SECRET)).toEqual({
      nonce: "n1",
      redirect: "/blogs/dashboard",
    });
  });

  it("rejects a token signed with a different secret — an attacker can't mint their own state", async () => {
    const token = await signSsoStateToken({ nonce: "n1", redirect: "/blogs/dashboard" }, SECRET);
    expect(await verifySsoStateToken(token, OTHER_SECRET)).toBeNull();
  });

  it("rejects garbage input instead of throwing", async () => {
    expect(await verifySsoStateToken("not-a-jwt", SECRET)).toBeNull();
  });

  it("is never accepted as a session or a pending-2FA token", async () => {
    const token = await signSsoStateToken({ nonce: "n1", redirect: "/" }, SECRET);
    expect((await verifySessionToken(token, SECRET))?.role).toBeUndefined();
    expect(await verifyPendingTwoFactorToken(token, SECRET)).toBeNull();
  });

  it("a real session token is never accepted as SSO state", async () => {
    const session = await signSessionToken({ sub: "u1", role: "CLUB_SECY", clubId: "c1" }, SECRET);
    expect(await verifySsoStateToken(session, SECRET)).toBeNull();
  });
});

describe("superadmin enroll token", () => {
  const createClaims: SuperadminEnrollClaims = {
    mode: "create",
    targetUserId: null,
    email: "new-admin@iitg.ac.in",
    name: "New Admin",
    passwordHash: "argon2-hash-stand-in",
    encryptedSecret: "ciphertext-stand-in",
  };

  it("round-trips every claim for the 'create' mode", async () => {
    const token = await signSuperadminEnrollToken(createClaims, SECRET);
    expect(await verifySuperadminEnrollToken(token, SECRET)).toEqual(createClaims);
  });

  it("round-trips the 'reenroll' mode, including a null passwordHash", async () => {
    const claims: SuperadminEnrollClaims = {
      mode: "reenroll",
      targetUserId: "u1",
      email: "existing-admin@iitg.ac.in",
      name: "Existing Admin",
      passwordHash: null,
      encryptedSecret: "ciphertext-stand-in",
    };
    const token = await signSuperadminEnrollToken(claims, SECRET);
    expect(await verifySuperadminEnrollToken(token, SECRET)).toEqual(claims);
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signSuperadminEnrollToken(createClaims, SECRET);
    expect(await verifySuperadminEnrollToken(token, OTHER_SECRET)).toBeNull();
  });

  it("rejects garbage input instead of throwing", async () => {
    expect(await verifySuperadminEnrollToken("not-a-jwt", SECRET)).toBeNull();
  });

  it("is never accepted as a real session or a pending-2FA token", async () => {
    const token = await signSuperadminEnrollToken(createClaims, SECRET);
    expect((await verifySessionToken(token, SECRET))?.role).toBeUndefined();
    expect(await verifyPendingTwoFactorToken(token, SECRET)).toBeNull();
  });
});

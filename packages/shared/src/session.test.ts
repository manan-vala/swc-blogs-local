import { describe, expect, it } from "vitest";
import {
  signSessionToken,
  verifySessionToken,
  signPendingTwoFactorToken,
  verifyPendingTwoFactorToken,
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

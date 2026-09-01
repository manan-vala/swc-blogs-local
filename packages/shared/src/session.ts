import { SignJWT, jwtVerify } from "jose";

/**
 * Shared session token — signed and verified identically by apps/api
 * (issues it after SSO callback / TOTP verify) and apps/web (reads it
 * server-side to render the dashboard/admin panel). This is the second
 * cross-service seam the monorepo split creates, alongside the
 * revalidate call in §4 — without a shared verification path, only
 * Express would ever know who's logged in.
 *
 * A JWT (rather than replicating cookie-session's own serialization
 * format) is what makes "verify identically on both sides" cheap:
 * both just call jwtVerify with the same secret.
 */

export const SESSION_COOKIE_NAME = "swc_blogs_session";
export const SESSION_TTL_SECONDS = 6 * 60 * 60; // short-lived — separate from any SSO-side session (§7)

export interface SessionClaims {
  sub: string; // userId
  role: "SUPERADMIN" | "CLUB_SECY";
  clubId: string | null;
}

export async function signSessionToken(claims: SessionClaims, secret: string): Promise<string> {
  return new SignJWT({ role: claims.role, clubId: claims.clubId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS)
    .sign(new TextEncoder().encode(secret));
}

export async function verifySessionToken(token: string, secret: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    return {
      sub: payload.sub as string,
      role: payload.role as SessionClaims["role"],
      clubId: (payload.clubId as string | null) ?? null,
    };
  } catch {
    return null; // expired, malformed, or wrong secret — treat all identically
  }
}

/**
 * The superadmin login's intermediate step (§7): password verified,
 * second factor not yet. A JWT rather than a plain userId string so the
 * client can't just hand back any user id it likes to skip straight to
 * "which account's second factor am I trying" — verify-totp only trusts
 * a sub it can verify came from a password check it ran itself minutes
 * ago. `purpose` keeps this from ever being confused with, or accepted
 * as, a real session token (and vice versa) even though both are HS256
 * JWTs signed with the same SESSION_SECRET.
 */
const PENDING_2FA_TTL_SECONDS = 5 * 60;
const PENDING_2FA_PURPOSE = "2fa-pending";

export async function signPendingTwoFactorToken(userId: string, secret: string): Promise<string> {
  return new SignJWT({ purpose: PENDING_2FA_PURPOSE })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + PENDING_2FA_TTL_SECONDS)
    .sign(new TextEncoder().encode(secret));
}

/** Returns the pending userId, or null if the token is invalid, expired,
 *  or — despite verifying — isn't actually a pending-2FA token. */
export async function verifyPendingTwoFactorToken(token: string, secret: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    if (payload.purpose !== PENDING_2FA_PURPOSE || typeof payload.sub !== "string") return null;
    return payload.sub;
  } catch {
    return null;
  }
}

/**
 * The superadmin panel's "create a superadmin" / "re-enrol TOTP" flow
 * (§7): a QR code gets shown, then §7's mandatory live-code check has
 * to pass BEFORE anything is written to User — same rule the CLI
 * enforces (see create-superadmin.ts), just over HTTP instead of a
 * terminal prompt loop. Nothing is persisted between "start" and
 * "verify", so this token IS the pending state: everything the verify
 * step needs travels in it, signed so the browser can't edit `mode` or
 * `targetUserId` to redirect the enrollment onto a different account.
 * `encryptedSecret` is the same ciphertext `encryptTotpSecret` produces
 * for at-rest storage — this token is short-lived either way, but
 * there's no reason to hold the plaintext secret in it when the
 * already-established encryption helper is right there.
 */
export interface SuperadminEnrollClaims {
  mode: "create" | "reenroll";
  targetUserId: string | null; // set only for "reenroll"
  email: string;
  name: string;
  passwordHash: string | null; // set only for "create" — reenroll leaves the password alone
  encryptedSecret: string;
}

const SUPERADMIN_ENROLL_TTL_SECONDS = 10 * 60;
const SUPERADMIN_ENROLL_PURPOSE = "superadmin-enroll";

export async function signSuperadminEnrollToken(
  claims: SuperadminEnrollClaims,
  secret: string
): Promise<string> {
  return new SignJWT({ purpose: SUPERADMIN_ENROLL_PURPOSE, ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + SUPERADMIN_ENROLL_TTL_SECONDS)
    .sign(new TextEncoder().encode(secret));
}

export async function verifySuperadminEnrollToken(
  token: string,
  secret: string
): Promise<SuperadminEnrollClaims | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    if (payload.purpose !== SUPERADMIN_ENROLL_PURPOSE) return null;
    return {
      mode: payload.mode as SuperadminEnrollClaims["mode"],
      targetUserId: (payload.targetUserId as string | null) ?? null,
      email: payload.email as string,
      name: payload.name as string,
      passwordHash: (payload.passwordHash as string | null) ?? null,
      encryptedSecret: payload.encryptedSecret as string,
    };
  } catch {
    return null;
  }
}

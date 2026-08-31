import { Router, type Response } from "express";
import {
  superadminLoginSchema,
  totpVerifySchema,
  backupCodeVerifySchema,
  signSessionToken,
  signPendingTwoFactorToken,
  verifyPendingTwoFactorToken,
} from "@swc-blogs/shared";
import { prisma } from "@swc-blogs/db";
import { authRateLimit } from "../middleware/rateLimit.js";
import { setSessionCookie, clearSessionCookie } from "../middleware/session.js";
import {
  verifyPassword,
  verifyTotpCode,
  decryptTotpSecret,
  verifyBackupCode,
  isLockedOut,
  nextFailedAttemptState,
  SUCCESSFUL_LOGIN_STATE,
} from "../services/auth.service.js";
import { env } from "../lib/env.js";

export const authRouter = Router();

/** Works for either session kind — secretary or superadmin — since both
 *  are the same cookie. Always 200s, even with nothing to clear: from
 *  the caller's side "make sure I'm signed out" should never fail. */
authRouter.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

/**
 * Club secretary sign-in — design doc §7, step 1: SSO redirect →
 * callback → email checked against Whitelist → session issued with
 * role + club. Institute SSO isn't wired yet: which protocol IITG
 * actually speaks (CAS vs OAuth2/OIDC) is still open per §13, and
 * SSO_CLIENT_ID/SSO_CLIENT_SECRET have nowhere to be used until it's
 * decided. Both endpoints fail closed with 501 until then.
 *
 * This replaces a real bug, not just a stub: the previous callback
 * trusted `req.query.email` directly as a verified identity, so
 * `GET /sso/callback?email=<any-whitelisted-address>` minted a valid
 * session for that secretary — no SSO involved. There's no partial-safe
 * middle ground between "verified by the SSO exchange" and "not wired";
 * a callback that issues sessions from unauthenticated input is worse
 * than one that 501s.
 *
 * admitClubSecretary() below keeps the whitelist-check-and-issue logic
 * ready: once the exchange lands, the callback becomes "verify the
 * code, pull the email out of the verified SSO profile, then call
 * admitClubSecretary(email)". Never call it with request input that
 * hasn't gone through that verification.
 */
authRouter.get("/sso/login", (_req, res) => {
  // TODO: redirect to SSO_CLIENT_ID's authorize endpoint.
  res.status(501).json({ error: "SSO integration not yet wired." });
});

authRouter.get("/sso/callback", async (_req, res) => {
  // TODO: exchange the code, verify it, and extract the email from the
  // SSO profile — then await admitClubSecretary(email) and set the
  // cookie on ok:true, or redirect with a not-whitelisted notice.
  res.status(501).json({ error: "SSO integration not yet wired." });
});

/**
 * Whitelist check + session issuance for a club secretary — the second
 * half of §7 step 1. `email` must already be verified by the caller
 * (i.e. it came out of a completed SSO exchange) — this function does
 * no verification of its own and will happily upsert a User and hand
 * back a live session token for whatever string it's given.
 */
export async function admitClubSecretary(
  email: string
): Promise<{ ok: true; token: string; clubId: string } | { ok: false; reason: "not-whitelisted" }> {
  const entry = await prisma.whitelist.findFirst({ where: { email, revokedAt: null } });
  if (!entry) return { ok: false, reason: "not-whitelisted" };

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: email.split("@")[0]!,
      role: "CLUB_SECY",
      provider: "SSO",
      clubId: entry.clubId,
    },
    update: { lastLoginAt: new Date(), clubId: entry.clubId },
  });

  const token = await signSessionToken(
    { sub: user.id, role: user.role, clubId: user.clubId },
    env.SESSION_SECRET
  );
  return { ok: true, token, clubId: entry.clubId };
}

/**
 * Superadmin sign-in — email + password, then TOTP (or a backup code).
 * Break-glass path, independent of SSO (§7). Rate-limited on every step
 * here at the IP level; the per-account lockout below layers on top —
 * see auth.service.ts's nextFailedAttemptState.
 */
authRouter.post("/admin/login", authRateLimit, async (req, res) => {
  const parsed = superadminLoginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input." });

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  // Generic failure copy — never reveal which half was wrong (§7).
  const fail = () => res.status(401).json({ error: "Incorrect email or password." });

  if (!user || user.role !== "SUPERADMIN" || !user.isActive || !user.passwordHash) return fail();
  if (isLockedOut(user)) {
    return res.status(423).json({ error: "Account temporarily locked. Try again later." });
  }

  const valid = await verifyPassword(user.passwordHash, parsed.data.password);
  if (!valid) {
    await prisma.user.update({ where: { id: user.id }, data: nextFailedAttemptState(user.failedLogins) });
    return fail();
  }

  // Password correct — issue a short-lived, purpose-bound pending token
  // rather than trusting a client-supplied userId for the next step.
  const pendingToken = await signPendingTwoFactorToken(user.id, env.SESSION_SECRET);
  res.json({ pendingToken, totpRequired: true });
});

/** Resolves a pendingToken to a still-eligible SUPERADMIN, or sends the
 *  appropriate failure response itself and returns null. Shared by both
 *  second-factor routes below so lockout/expiry handling can't drift
 *  between them. */
async function resolvePendingSuperadmin(pendingToken: string, res: Response) {
  const userId = await verifyPendingTwoFactorToken(pendingToken, env.SESSION_SECRET);
  if (!userId) {
    res.status(401).json({ error: "Session expired — sign in again." });
    return null;
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== "SUPERADMIN" || !user.isActive) {
    res.status(401).json({ error: "Invalid code." });
    return null;
  }
  if (isLockedOut(user)) {
    res.status(423).json({ error: "Account temporarily locked. Try again later." });
    return null;
  }
  return user;
}

function issueSuperadminSession(res: Response, userId: string) {
  return signSessionToken({ sub: userId, role: "SUPERADMIN", clubId: null }, env.SESSION_SECRET).then(
    (token) => setSessionCookie(res, token)
  );
}

authRouter.post("/admin/verify-totp", authRateLimit, async (req, res) => {
  const parsed = totpVerifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input." });

  const user = await resolvePendingSuperadmin(parsed.data.pendingToken, res);
  if (!user) return; // response already sent

  if (!user.totpSecret) return res.status(401).json({ error: "Invalid code." });
  const secret = decryptTotpSecret(user.totpSecret);
  const { valid, step } = verifyTotpCode(secret, parsed.data.code, user.totpLastStep);
  if (!valid) {
    await prisma.user.update({ where: { id: user.id }, data: nextFailedAttemptState(user.failedLogins) });
    return res.status(401).json({ error: "Invalid code." });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { totpLastStep: step, lastLoginAt: new Date(), ...SUCCESSFUL_LOGIN_STATE },
  });
  await issueSuperadminSession(res, user.id);
  res.json({ ok: true });
});

/**
 * Backup-code login — §7's recovery path for a lost TOTP device. There's
 * no way to look a code up by hash, so every unused code is checked
 * against argon2.verify; ten unused rows is nothing to iterate.
 */
authRouter.post("/admin/verify-backup-code", authRateLimit, async (req, res) => {
  const parsed = backupCodeVerifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input." });

  const user = await resolvePendingSuperadmin(parsed.data.pendingToken, res);
  if (!user) return; // response already sent

  const unused = await prisma.backupCode.findMany({ where: { userId: user.id, usedAt: null } });
  let matchedId: string | null = null;
  for (const candidate of unused) {
    if (await verifyBackupCode(candidate.codeHash, parsed.data.code)) {
      matchedId = candidate.id;
      break;
    }
  }

  if (!matchedId) {
    await prisma.user.update({ where: { id: user.id }, data: nextFailedAttemptState(user.failedLogins) });
    return res.status(401).json({ error: "Invalid code." });
  }

  await prisma.$transaction([
    prisma.backupCode.update({ where: { id: matchedId }, data: { usedAt: new Date() } }),
    prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), ...SUCCESSFUL_LOGIN_STATE } }),
  ]);
  await issueSuperadminSession(res, user.id);
  res.json({ ok: true, backupCodesRemaining: unused.length - 1 });
});

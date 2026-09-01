import { Router, type Response } from "express";
import crypto from "node:crypto";
import {
  superadminLoginSchema,
  totpVerifySchema,
  backupCodeVerifySchema,
  signSessionToken,
  signPendingTwoFactorToken,
  verifyPendingTwoFactorToken,
  signSsoStateToken,
  verifySsoStateToken,
} from "@swc-blogs/shared";
import { prisma } from "@swc-blogs/db";
import { authRateLimit } from "../middleware/rateLimit.js";
import {
  setSessionCookie,
  clearSessionCookie,
  setSsoNonceCookie,
  clearSsoNonceCookie,
  SSO_NONCE_COOKIE_NAME,
} from "../middleware/session.js";
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchMicrosoftProfile,
  emailFromProfile,
  displayNameFromProfile,
  assertSafeRedirect,
} from "../services/microsoft-sso.service.js";
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
 * role + club. §13's open "CAS vs OAuth2/OIDC" question is settled by
 * IITG accounts being Microsoft Entra ID; the protocol mechanics live
 * in microsoft-sso.service.ts, the trust decisions live here.
 *
 * The ordering below is the whole security argument, and it is not
 * rearrangeable: Microsoft establishes *who* this is, then Whitelist
 * decides *whether they may publish*, and only then is a session
 * issued. A previous version of this callback trusted
 * `req.query.email` directly, so `?email=<any-whitelisted-address>`
 * minted a valid session for that secretary with no SSO involved —
 * that bug is exactly what skipping the first step looks like.
 */
const DEFAULT_POST_LOGIN_REDIRECT = "/blogs/dashboard";

/** Where the browser lands after the callback. WEB_URL already includes
 *  the /blogs basePath (see env.ts), and redirect paths are stored with
 *  it too, so strip it here rather than doubling it. */
function webUrl(pathWithBasePath: string): string {
  return new URL(pathWithBasePath, env.WEB_URL).toString();
}

authRouter.get("/sso/login", authRateLimit, async (req, res) => {
  const requested = typeof req.query.redirect === "string" ? req.query.redirect : "";
  const redirect = assertSafeRedirect(requested, DEFAULT_POST_LOGIN_REDIRECT);

  // The nonce goes two places: signed into the state Microsoft echoes
  // back, and into a cookie only this browser holds. The callback
  // requires both to match, which is what stops an attacker replaying
  // their own completed login into someone else's browser.
  const nonce = crypto.randomBytes(16).toString("base64url");
  const state = await signSsoStateToken({ nonce, redirect }, env.SESSION_SECRET);

  setSsoNonceCookie(res, nonce);
  res.redirect(buildAuthorizeUrl(state));
});

authRouter.get("/sso/callback", authRateLimit, async (req, res) => {
  const { code, error, error_description: errorDescription, state } = req.query;

  // The nonce cookie has served its purpose either way — a failed
  // attempt must not leave a reusable one behind.
  const presentedNonce = req.cookies?.[SSO_NONCE_COOKIE_NAME];
  clearSsoNonceCookie(res);

  const fail = (reason: string) =>
    res.redirect(webUrl(`/blogs/login?error=${encodeURIComponent(reason)}`));

  if (error) {
    // User cancelled at the Microsoft prompt, or Entra refused. Their
    // own message is written for a developer, not a club secretary.
    console.warn("[sso] Microsoft returned an error:", errorDescription ?? error);
    return fail("sso-failed");
  }
  if (typeof code !== "string" || !code) return fail("sso-failed");

  const claims = typeof state === "string" ? await verifySsoStateToken(state, env.SESSION_SECRET) : null;
  if (!claims) return fail("expired");
  // Constant-time isn't warranted (a nonce mismatch is not a secret
  // being guessed byte-by-byte), but the comparison must happen.
  if (!presentedNonce || presentedNonce !== claims.nonce) return fail("expired");

  let email: string;
  let profileName: string;
  try {
    const { access_token } = await exchangeCodeForToken(code);
    const profile = await fetchMicrosoftProfile(access_token);
    email = emailFromProfile(profile);
    profileName = displayNameFromProfile(profile, email);
  } catch (err) {
    console.error("[sso] exchange failed:", err instanceof Error ? err.message : err);
    return fail("sso-failed");
  }

  if (!email) return fail("sso-failed");

  // Identity is now established by Microsoft. Authorization is a
  // separate question, and the answer lives in the Whitelist.
  const result = await admitClubSecretary(email, profileName);
  if (!result.ok) {
    console.warn("[sso] login rejected, not whitelisted:", email);
    return fail("not-whitelisted");
  }

  setSessionCookie(res, result.token);
  return res.redirect(webUrl(assertSafeRedirect(claims.redirect, DEFAULT_POST_LOGIN_REDIRECT)));
});

/**
 * Whitelist check + session issuance for a club secretary — the second
 * half of §7 step 1. `email` must already be verified by the caller
 * (i.e. it came out of a completed SSO exchange) — this function does
 * no verification of its own and will happily upsert a User and hand
 * back a live session token for whatever string it's given.
 *
 * `name` likewise comes from the verified Microsoft profile when there
 * is one; it's optional so the whitelist/session half stays testable
 * on its own, and falls back to the email's local part.
 */
export async function admitClubSecretary(
  email: string,
  name?: string
): Promise<{ ok: true; token: string; clubId: string } | { ok: false; reason: "not-whitelisted" }> {
  const entry = await prisma.whitelist.findFirst({ where: { email, revokedAt: null } });
  if (!entry) return { ok: false, reason: "not-whitelisted" };

  const displayName = name?.trim() || email.split("@")[0]!;
  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: displayName,
      role: "CLUB_SECY",
      provider: "SSO",
      clubId: entry.clubId,
    },
    // Name refreshes on every login: Entra is the source of truth for
    // it, and a secretary who changes their display name there should
    // not stay stale here forever.
    update: { name: displayName, lastLoginAt: new Date(), clubId: entry.clubId },
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

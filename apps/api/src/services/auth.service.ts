import argon2 from "argon2";
import { authenticator } from "otplib";
import crypto from "node:crypto";
import { env } from "../lib/env.js";

/** argon2id, never a fast hash (§7). */
export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  return argon2.verify(hash, plain);
}

// --- Account lockout (§7: "rate limiting and lockout ... with a slow
// lockout after repeated failures. Track failedLoginCount and
// lockedUntil on the user.") ---
//
// Pure state transitions only — no DB access here, by the same
// convention as the rest of this file (packages/db stays free of auth
// logic; the routes own every prisma call). Callers persist whatever
// these return.

export const LOCKOUT_THRESHOLD = 5; // failed attempts before the first lock
export const LOCKOUT_BASE_MINUTES = 15;

export function isLockedOut(user: { lockedUntil: Date | null }): boolean {
  return user.lockedUntil !== null && user.lockedUntil.getTime() > Date.now();
}

/**
 * The state to persist after one failed password/TOTP/backup-code
 * attempt. Locks only on the attempt that lands exactly on a multiple
 * of the threshold — attempt 5, 10, 15, ... — for a window that
 * escalates each time: 15 minutes, 30, 45, and so on. Reuses the one
 * `failedLogins` counter already on User rather than adding a separate
 * "how many times locked" column.
 *
 * Only ever called once the caller has confirmed the account isn't
 * *currently* locked (routes check isLockedOut first), so this only
 * runs for attempt 6-9 once a lock from attempt 5 has already expired —
 * meaning those get another `lockedUntil: null` clear pass before
 * attempt 10 locks again, harder. That's deliberate, not a gap: it's
 * what makes each cycle actually escalate instead of the first lock's
 * expiry silently discounting every attempt after it.
 */
export function nextFailedAttemptState(
  currentFailedLogins: number
): { failedLogins: number; lockedUntil: Date | null } {
  const failedLogins = currentFailedLogins + 1;
  const cycles = Math.floor(failedLogins / LOCKOUT_THRESHOLD);
  const justCrossedThreshold = failedLogins % LOCKOUT_THRESHOLD === 0;
  const lockedUntil = justCrossedThreshold
    ? new Date(Date.now() + LOCKOUT_BASE_MINUTES * cycles * 60 * 1000)
    : null;
  return { failedLogins, lockedUntil };
}

/** The state to persist once the final factor succeeds. */
export const SUCCESSFUL_LOGIN_STATE = { failedLogins: 0, lockedUntil: null as Date | null };

// --- TOTP (§7) ---

/**
 * otplib's own defaults (30-second step, zero window) live inside its
 * internal allOptions() merge (used by generate/checkDelta/keyuri) and
 * are never reflected on the public `authenticator.options` getter
 * unless something sets them explicitly. Two gaps came from that:
 *
 * - `.options.step` read as `undefined`, which is how the replay guard
 *   below was broken: `currentStep` came out NaN, so every "step
 *   already used" comparison was `NaN <= number`, always false. Setting
 *   it here means the step verifyTotpCode tracks for replay purposes is
 *   guaranteed to be the same value checkDelta() actually verifies
 *   against, not a second hardcoded constant that could drift from it.
 * - `window` silently defaulted to 0 — no drift tolerance at all,
 *   despite §7 explicitly calling for "+/-1 time step for clock drift".
 */
authenticator.options = { step: 30, window: 1 };

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function totpKeyUri(secret: string, email: string): string {
  return authenticator.keyuri(email, "SWC Blogs", secret);
}

/**
 * Verifies a code and returns the accepted time-step, or null.
 * Callers MUST reject a step already stored on User.totpLastStep —
 * otherwise a captured code stays valid for its full window (~90s
 * with drift tolerance). See §7, "reject a step number already used".
 */
export function verifyTotpCode(
  secret: string,
  code: string,
  lastAcceptedStep: number | null
): { valid: boolean; step: number | null } {
  const delta = authenticator.checkDelta(code, secret); // null if invalid, else drift in steps
  if (delta === null) return { valid: false, step: null };

  const currentStep = Math.floor(Date.now() / 1000 / authenticator.options.step!);
  const acceptedStep = currentStep + delta;

  if (lastAcceptedStep !== null && acceptedStep <= lastAcceptedStep) {
    return { valid: false, step: null }; // replay
  }
  return { valid: true, step: acceptedStep };
}

// --- Backup codes (§7) ---

export function generateBackupCodes(count = 10): string[] {
  return Array.from({ length: count }, () =>
    crypto.randomBytes(5).toString("hex") // 10 hex chars, e.g. "a1b2c3d4e5"
  );
}

export async function hashBackupCode(code: string): Promise<string> {
  return argon2.hash(code, { type: argon2.argon2id });
}

export async function verifyBackupCode(hash: string, plain: string): Promise<boolean> {
  return argon2.verify(hash, plain);
}

// --- totpSecret encryption at rest (§7) ---

const ALGO = "aes-256-gcm";

export function encryptTotpSecret(secret: string): string {
  const key = Buffer.from(env.TOTP_ENCRYPTION_KEY.slice(0, 32));
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

export function decryptTotpSecret(stored: string): string {
  const raw = Buffer.from(stored, "base64");
  const key = Buffer.from(env.TOTP_ENCRYPTION_KEY.slice(0, 32));
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

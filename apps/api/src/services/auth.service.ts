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

// --- TOTP (§7) ---

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

import { describe, expect, it } from "vitest";
import {
  isLockedOut,
  nextFailedAttemptState,
  SUCCESSFUL_LOGIN_STATE,
  LOCKOUT_THRESHOLD,
  hashBackupCode,
  verifyBackupCode,
  hashPassword,
  verifyPassword,
  generateTotpSecret,
  verifyTotpCode,
} from "./auth.service.js";
import { authenticator } from "otplib";

describe("isLockedOut", () => {
  it("is false with no lockedUntil at all", () => {
    expect(isLockedOut({ lockedUntil: null })).toBe(false);
  });

  it("is true while lockedUntil is in the future", () => {
    expect(isLockedOut({ lockedUntil: new Date(Date.now() + 60_000) })).toBe(true);
  });

  it("is false once lockedUntil is in the past", () => {
    expect(isLockedOut({ lockedUntil: new Date(Date.now() - 1) })).toBe(false);
  });
});

describe("nextFailedAttemptState", () => {
  it("increments failedLogins without locking below the threshold", () => {
    for (let i = 0; i < LOCKOUT_THRESHOLD - 1; i++) {
      const { failedLogins, lockedUntil } = nextFailedAttemptState(i);
      expect(failedLogins).toBe(i + 1);
      expect(lockedUntil).toBeNull();
    }
  });

  it("locks on the attempt that reaches the threshold", () => {
    const { failedLogins, lockedUntil } = nextFailedAttemptState(LOCKOUT_THRESHOLD - 1);
    expect(failedLogins).toBe(LOCKOUT_THRESHOLD);
    expect(lockedUntil).not.toBeNull();
    expect(lockedUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  it("escalates the lockout window on a second cycle of failures", () => {
    const first = nextFailedAttemptState(LOCKOUT_THRESHOLD - 1);
    const second = nextFailedAttemptState(LOCKOUT_THRESHOLD * 2 - 1);
    const firstWindowMs = first.lockedUntil!.getTime() - Date.now();
    const secondWindowMs = second.lockedUntil!.getTime() - Date.now();
    expect(secondWindowMs).toBeGreaterThan(firstWindowMs * 1.5); // roughly double, allow slack for exec time
  });

  it("does not re-lock on an attempt between threshold multiples", () => {
    const { lockedUntil } = nextFailedAttemptState(LOCKOUT_THRESHOLD); // -> failedLogins = threshold + 1
    expect(lockedUntil).toBeNull();
  });
});

describe("SUCCESSFUL_LOGIN_STATE", () => {
  it("clears both the counter and any lock", () => {
    expect(SUCCESSFUL_LOGIN_STATE).toEqual({ failedLogins: 0, lockedUntil: null });
  });
});

describe("password hashing", () => {
  it("verifies a matching password and rejects a wrong one", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword(hash, "correct horse battery staple")).toBe(true);
    expect(await verifyPassword(hash, "wrong password entirely")).toBe(false);
  });
});

describe("backup codes", () => {
  it("verifies a matching code and rejects a wrong one", async () => {
    const hash = await hashBackupCode("a1b2c3d4e5");
    expect(await verifyBackupCode(hash, "a1b2c3d4e5")).toBe(true);
    expect(await verifyBackupCode(hash, "0000000000")).toBe(false);
  });
});

describe("verifyTotpCode", () => {
  it("accepts a currently-valid code and returns a real step number, not NaN", () => {
    const secret = generateTotpSecret();
    const code = authenticator.generate(secret);
    const result = verifyTotpCode(secret, code, null);

    expect(result.valid).toBe(true);
    // The regression this guards: otplib's step default isn't reflected
    // on authenticator.options unless set explicitly (see the module
    // doc above authenticator.options = {...}) — reading it unset made
    // this NaN, and Number.isInteger(NaN) is false, so this assertion
    // fails loudly instead of the bug silently passing `step: null`
    // through JSON serialization the way it did in the original report.
    expect(Number.isInteger(result.step)).toBe(true);
  });

  it("rejects an invalid code", () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode(secret, "000000", null).valid).toBe(false);
  });

  it("rejects a replay of an already-accepted step — §7's explicit requirement", () => {
    const secret = generateTotpSecret();
    const code = authenticator.generate(secret);

    const first = verifyTotpCode(secret, code, null);
    expect(first.valid).toBe(true);

    // Same code, same step, presented again with the step it was
    // accepted at now recorded as lastAcceptedStep — must be rejected.
    const replay = verifyTotpCode(secret, code, first.step);
    expect(replay.valid).toBe(false);
    expect(replay.step).toBeNull();
  });

  it("rejects a valid code whose step doesn't come after the watermark (boundary is <=, not <)", () => {
    const secret = generateTotpSecret();
    const code = authenticator.generate(secret);
    const currentStep = verifyTotpCode(secret, code, null).step!;

    // A watermark already at (not just past) this code's step must
    // still reject it — otherwise the replay guard only ever catches
    // every *other* replay and lets the exact boundary case through.
    expect(verifyTotpCode(secret, code, currentStep).valid).toBe(false);
    // One step ahead of the watermark is fine.
    expect(verifyTotpCode(secret, code, currentStep - 1).valid).toBe(true);
  });
});

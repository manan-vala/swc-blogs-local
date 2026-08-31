/**
 * Creates — or resets — a SUPERADMIN account, end to end: password,
 * TOTP enrolment, and backup codes in one run. Design doc §7: there is
 * no public signup and no public password-reset flow, so this is both
 * the only way to bootstrap the very first maintainer and the only
 * reset path afterwards ("a reset is a maintainer running the CLI, not
 * an email flow — there is no mailbox to trust here"). Run on the
 * server by someone who already has that access; further superadmins
 * beyond the first are created from inside the panel instead.
 *
 * Usage:
 *   pnpm --filter @swc-blogs/api exec tsx src/cli/create-superadmin.ts <email> <name>
 *
 * Prompts for the password interactively rather than accepting one as
 * an argument, so it never ends up in shell history. TOTP enrolment
 * happens here too — §7 requires it, and there's no other bootstrap
 * moment to do it in: a superadmin who could log in before enrolling
 * would have a password-only account until they got around to it.
 * One live code must verify before anything is saved, exactly as §7
 * specifies, or a typo'd secret locks the account out immediately.
 * Backup codes are shown exactly once at the end — write them down now.
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import QRCode from "qrcode";
import { prisma } from "@swc-blogs/db";
import {
  hashPassword,
  generateTotpSecret,
  totpKeyUri,
  verifyTotpCode,
  encryptTotpSecret,
  generateBackupCodes,
  hashBackupCode,
} from "../services/auth.service.js";

async function main() {
  const [, , email, name] = process.argv;
  if (!email || !name) {
    console.error("Usage: tsx src/cli/create-superadmin.ts <email> <name>");
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.role !== "SUPERADMIN") {
    console.error(`${email} already exists as a ${existing.role} — refusing to overwrite a non-admin account.`);
    process.exit(1);
  }
  console.log(existing ? `Resetting superadmin ${email}.` : `Creating superadmin ${email}.`);
  if (existing) {
    console.log("This replaces their password, TOTP secret, and all backup codes.");
  }

  const rl = createInterface({ input: stdin, output: stdout });

  let password: string;
  for (;;) {
    password = await rl.question("New password (min 12 characters): ");
    if (password.length >= 12) break;
    console.error("Too short — try again.");
  }
  const passwordHash = await hashPassword(password);

  const secret = generateTotpSecret();
  const uri = totpKeyUri(secret, email);
  console.log("\nScan this with Google Authenticator / Authy (or enter the URI manually):\n");
  console.log(await QRCode.toString(uri, { type: "terminal", small: true }));
  console.log(uri);

  // §7: verify one live code BEFORE saving anything, or a fat-fingered
  // secret locks the account out the moment this script exits.
  let confirmedStep: number | null = null;
  for (;;) {
    const code = await rl.question("\nEnter the 6-digit code to confirm: ");
    const result = verifyTotpCode(secret, code, null);
    if (result.valid) {
      confirmedStep = result.step;
      break;
    }
    console.error("That code didn't verify — check the time on your device and try the next one.");
  }

  const backupCodes = generateBackupCodes();
  const backupCodeHashes = await Promise.all(backupCodes.map(hashBackupCode));

  rl.close();

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name,
      role: "SUPERADMIN",
      provider: "PASSWORD",
      passwordHash,
      passwordSetAt: new Date(),
      totpSecret: encryptTotpSecret(secret),
      totpEnabledAt: new Date(),
      totpLastStep: confirmedStep,
    },
    update: {
      name,
      isActive: true,
      passwordHash,
      passwordSetAt: new Date(),
      failedLogins: 0,
      lockedUntil: null,
      totpSecret: encryptTotpSecret(secret),
      totpEnabledAt: new Date(),
      totpLastStep: confirmedStep,
    },
  });

  // Old codes are void the moment new ones are issued — never leave two
  // valid sets of backup codes for the same account at once.
  await prisma.backupCode.deleteMany({ where: { userId: user.id } });
  await prisma.backupCode.createMany({
    data: backupCodeHashes.map((codeHash) => ({ userId: user.id, codeHash })),
  });

  console.log(`\n${existing ? "Reset" : "Created"} superadmin ${user.email} (${user.id}).`);
  console.log("\nBackup codes — store these somewhere safe now, they will not be shown again:\n");
  for (const code of backupCodes) console.log(`  ${code}`);
  console.log();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

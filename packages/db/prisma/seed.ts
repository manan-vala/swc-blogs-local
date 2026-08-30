/**
 * Creates the first SUPERADMIN account. There is no public signup or
 * password-reset flow by design (§7) — this script is the only way
 * to bootstrap the first maintainer. Run it once on the server, then
 * every further superadmin is created from inside the panel.
 *
 * Usage:
 *   pnpm --filter @swc-blogs/db exec tsx prisma/seed.ts <email> <name>
 *
 * Prompts for a password interactively rather than accepting one as an
 * argument, so it never ends up in shell history.
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { prisma } from "../src/index.js";

// TODO: swap for the real argon2id hashing helper once apps/api/src/lib/auth
// exists — kept dependency-free here since packages/db has no auth logic.
async function hashPassword(_plain: string): Promise<string> {
  throw new Error(
    "Wire this to apps/api's argon2id helper before running the seed script."
  );
}

async function main() {
  const [, , email, name] = process.argv;
  if (!email || !name) {
    console.error("Usage: tsx prisma/seed.ts <email> <name>");
    process.exit(1);
  }

  const rl = createInterface({ input: stdin, output: stdout });
  const password = await rl.question("Password for the first superadmin: ");
  rl.close();

  if (password.length < 12) {
    console.error("Password must be at least 12 characters.");
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      email,
      name,
      role: "SUPERADMIN",
      provider: "PASSWORD",
      passwordHash,
      passwordSetAt: new Date(),
    },
  });

  console.log(`Created superadmin ${user.email} (${user.id}).`);
  console.log("Next: log in and enrol TOTP — see design doc §7.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

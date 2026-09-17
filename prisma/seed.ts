import { prisma } from "../lib/prisma";

/**
 * Seed script — creates the initial admin account for the Controlcenter.
 *
 * Run with: npm run db:seed
 *
 * Env vars:
 *  SEED_ADMIN_EMAIL    (default: admin@coledia.ch)
 *  SEED_ADMIN_PASSWORD (default: none — if unset, the user is created without
 *                       a password; use "forgot password" to set one, provided
 *                       SMTP is configured)
 *  SEED_ADMIN_NAME     (default: "Coledia Admin")
 *
 * The script is idempotent — an existing admin with the same email is updated.
 */

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@coledia.ch").toLowerCase();
  const name = process.env.SEED_ADMIN_NAME ?? "Coledia Admin";
  const password = process.env.SEED_ADMIN_PASSWORD;

  console.log("Seeding Controlcenter database...\n");

  const user = await prisma.user.upsert({
    where: { email },
    update: { role: "admin", name, emailVerified: true },
    create: { email, name, emailVerified: true, role: "admin" },
  });
  console.log(`✓ Admin user: ${user.email} (${user.id})`);

  if (password) {
    const { hashPassword } = await import("better-auth/crypto");
    const hashed = await hashPassword(password);

    const existing = await prisma.account.findFirst({
      where: { userId: user.id, providerId: "credential" },
    });

    if (existing) {
      await prisma.account.update({
        where: { id: existing.id },
        data: { password: hashed },
      });
      console.log("✓ Password updated on existing credential account");
    } else {
      await prisma.account.create({
        data: {
          userId: user.id,
          accountId: user.id,
          providerId: "credential",
          password: hashed,
        },
      });
      console.log("✓ Credential account created with SEED_ADMIN_PASSWORD");
    }
  } else {
    console.log("! SEED_ADMIN_PASSWORD not set — no password written.");
    console.log("  Use the forgot-password flow to set one (requires SMTP).");
  }

  console.log("\nSeed complete.");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

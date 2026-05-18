import { PrismaClient, UserRole } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Sports catalogue
  const sports = [
    { key: "cricket",       name: "Cricket",        sortOrder: 1 },
    { key: "football",      name: "Football",       sortOrder: 2 },
    { key: "tennis",        name: "Tennis",         sortOrder: 3 },
    { key: "basketball",    name: "Basketball",     sortOrder: 4 },
    { key: "table-tennis",  name: "Table Tennis",   sortOrder: 5 },
    { key: "horse-racing",  name: "Horse Racing",   sortOrder: 6 },
    { key: "greyhound",     name: "Greyhound",      sortOrder: 7 },
    { key: "volleyball",    name: "Volleyball",     sortOrder: 8 },
    { key: "snooker",       name: "Snooker",        sortOrder: 9 },
    { key: "darts",         name: "Darts",          sortOrder: 10 },
  ];
  for (const s of sports) {
    await prisma.sport.upsert({ where: { key: s.key }, update: {}, create: s });
  }

  // Casino providers
  const providers = [
    { key: "evolution",      name: "Evolution Gaming" },
    { key: "pragmatic_play", name: "Pragmatic Play" },
    { key: "vivo_gaming",    name: "Vivo Gaming" },
    { key: "ezugi",          name: "Ezugi" },
    { key: "sa_gaming",      name: "SA Gaming" },
    { key: "playtech",       name: "Playtech" },
    { key: "spribe",         name: "Spribe" },
    { key: "smartsoft",      name: "SmartSoft" },
    { key: "mac88",          name: "Mac88" },
    { key: "jili",           name: "Jili" },
    { key: "tvbet",          name: "TVBet" },
    { key: "betgames",       name: "BetGames" },
  ];
  for (const p of providers) {
    await prisma.casinoProvider.upsert({ where: { key: p.key }, update: {}, create: p });
  }

  // Bootstrap super-admin
  const username = process.env.BOOTSTRAP_SUPERADMIN_USERNAME || "superadmin";
  const password = process.env.BOOTSTRAP_SUPERADMIN_PASSWORD || "ChangeMe!Now2026";
  const existing = await prisma.user.findUnique({ where: { username } });
  if (!existing) {
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        role: UserRole.SUPER_ADMIN,
        wallet: { create: {} },
        limits: { create: {} },
      },
    });
    console.log(`✔ Bootstrapped super-admin "${username}" (id=${user.id})`);
  } else {
    console.log(`✔ Super-admin already exists, skipping bootstrap.`);
  }

  // Sample announcement
  await prisma.announcement.create({
    data: {
      text: "Welcome to the exchange — bet responsibly. New users get welcome bonus.",
      level: "promo",
      active: true,
    },
  }).catch(() => {});

  console.log("✔ Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

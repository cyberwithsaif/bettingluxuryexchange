import { PrismaClient, UserRole } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const superadmin = await prisma.user.findUnique({ where: { username: "superadmin" } });
  if (!superadmin) {
    console.error("Superadmin not found! Run the seed script first.");
    return;
  }

  const username = "saif";
  const password = "saifsaif";
  const existing = await prisma.user.findUnique({ where: { username } });

  if (!existing) {
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        role: UserRole.USER,
        parentId: superadmin.id,
        partnershipBps: 0,
        creditReference: 5600,
        wallet: {
          create: {
            balance: 5600, // use balance instead of available
          }
        },
        limits: { create: {} },
      },
    });
    console.log(`✔ Created user "${username}" (id=${user.id}) with parent superadmin`);
  } else {
    // If it exists, update password to saifsaif and wallet balance
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        wallet: {
          update: {
            balance: 5600,
          }
        }
      }
    });
    console.log(`✔ User "${username}" already exists. Updated password and balance to 5600.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(() => prisma.$disconnect());

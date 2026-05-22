import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { Prisma, UserRole } from "@prisma/client";
import { PrismaService } from "../common/prisma/prisma.service";

/**
 * Idempotent first-run bootstrap.
 * If no SUPER_ADMIN exists yet, create one from BOOTSTRAP_SUPERADMIN_*
 * environment variables so the admin panel is reachable out-of-the-box.
 * Also ensures the sports catalogue exists (in case `pnpm db:seed` was
 * skipped).
 *
 * Cluster-safe: User.username is unique, so concurrent creates from
 * sibling workers collapse to one row via P2002. Sport upserts are
 * already idempotent.
 */
@Injectable()
export class BootstrapService implements OnModuleInit {
  private readonly logger = new Logger(BootstrapService.name);
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const existing = await this.prisma.user.findFirst({ where: { role: UserRole.SUPER_ADMIN } });
    if (existing) return;

    const username = process.env.BOOTSTRAP_SUPERADMIN_USERNAME ?? "superadmin";
    const password = process.env.BOOTSTRAP_SUPERADMIN_PASSWORD ?? "ChangeMe!Now2026";
    const passwordHash = await bcrypt.hash(password, 10);
    try {
      await this.prisma.user.create({
        data: {
          username,
          passwordHash,
          role: UserRole.SUPER_ADMIN,
          wallet: { create: {} },
          limits: { create: {} },
        },
      });
      this.logger.warn(`Bootstrapped SUPER_ADMIN "${username}" — change the password immediately.`);
    } catch (e) {
      // Another cluster worker won the race; that's the desired outcome.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        this.logger.log(`SUPER_ADMIN created by sibling worker — skipping.`);
      } else {
        throw e;
      }
    }

    const seedSports = [
      ["cricket", "Cricket", 1],
      ["football", "Football", 2],
      ["tennis", "Tennis", 3],
      ["basketball", "Basketball", 4],
      ["table-tennis", "Table Tennis", 5],
      ["horse-racing", "Horse Racing", 6],
      ["greyhound", "Greyhound", 7],
      ["volleyball", "Volleyball", 8],
      ["snooker", "Snooker", 9],
      ["darts", "Darts", 10],
    ] as const;
    for (const [key, name, sortOrder] of seedSports) {
      await this.prisma.sport.upsert({
        where: { key },
        update: {},
        create: { key, name, sortOrder },
      });
    }
  }
}

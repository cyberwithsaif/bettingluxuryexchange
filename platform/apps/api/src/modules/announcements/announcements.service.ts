import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class AnnouncementsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Active announcements visible to all users (public). */
  async listActive() {
    const now = new Date();
    return this.prisma.announcement.findMany({
      where: {
        active: true,
        OR: [
          { startsAt: null },
          { startsAt: { lte: now } },
        ],
        AND: [
          {
            OR: [
              { endsAt: null },
              { endsAt: { gte: now } },
            ],
          },
        ],
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /** All announcements for admin management. */
  listAll(opts: { limit?: number; skip?: number } = {}) {
    return this.prisma.announcement.findMany({
      orderBy: { createdAt: "desc" },
      take: Math.min(opts.limit ?? 50, 200),
      skip: opts.skip ?? 0,
    });
  }

  create(data: { text: string; level?: string; active?: boolean; startsAt?: Date; endsAt?: Date }) {
    return this.prisma.announcement.create({ data });
  }

  async update(id: string, data: Partial<{ text: string; level: string; active: boolean; startsAt: Date | null; endsAt: Date | null }>) {
    return this.prisma.announcement.update({ where: { id }, data });
  }

  async remove(id: string) {
    return this.prisma.announcement.delete({ where: { id } });
  }
}

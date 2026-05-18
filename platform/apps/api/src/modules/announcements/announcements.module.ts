import { Module } from "@nestjs/common";
import { AnnouncementsController } from "./announcements.controller";
import { AnnouncementsService } from "./announcements.service";
import { PrismaModule } from "../../common/prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService],
  exports: [AnnouncementsService],
})
export class AnnouncementsModule {}

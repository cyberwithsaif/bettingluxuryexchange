import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../../common/prisma/prisma.module";
import { WalletModule } from "../wallet/wallet.module";
import { AdminModule } from "../admin/admin.module";
import { ChickenRoadController } from "./chicken-road.controller";
import { ChickenRoadService } from "./chicken-road.service";
import { ChickenRoadGateway } from "./chicken-road.gateway";

@Module({
  imports:     [PrismaModule, WalletModule, AdminModule, JwtModule],
  controllers: [ChickenRoadController],
  providers:   [ChickenRoadService, ChickenRoadGateway],
  exports:     [ChickenRoadService],
})
export class ChickenRoadModule {}

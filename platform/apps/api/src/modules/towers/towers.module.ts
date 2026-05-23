import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../../common/prisma/prisma.module";
import { WalletModule } from "../wallet/wallet.module";
import { AdminModule } from "../admin/admin.module";
import { TowersController } from "./towers.controller";
import { TowersService } from "./towers.service";
import { TowersGateway } from "./towers.gateway";

@Module({
  imports:     [PrismaModule, WalletModule, AdminModule, JwtModule],
  controllers: [TowersController],
  providers:   [TowersService, TowersGateway],
  exports:     [TowersService],
})
export class TowersModule {}

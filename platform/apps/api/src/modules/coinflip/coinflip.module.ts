import { Module } from "@nestjs/common";
import { PrismaModule } from "../../common/prisma/prisma.module";
import { WalletModule } from "../wallet/wallet.module";
import { AdminModule } from "../admin/admin.module";
import { JwtModule } from "@nestjs/jwt";
import { CoinflipController } from "./coinflip.controller";
import { CoinflipService } from "./coinflip.service";
import { CoinflipGateway } from "./coinflip.gateway";

@Module({
  imports: [PrismaModule, WalletModule, AdminModule, JwtModule],
  controllers: [CoinflipController],
  providers: [CoinflipService, CoinflipGateway],
  exports: [CoinflipService],
})
export class CoinflipModule {}

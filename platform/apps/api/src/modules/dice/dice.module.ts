import { Module } from "@nestjs/common";
import { PrismaModule } from "../../common/prisma/prisma.module";
import { WalletModule } from "../wallet/wallet.module";
import { AdminModule } from "../admin/admin.module";
import { JwtModule } from "@nestjs/jwt";
import { DiceController } from "./dice.controller";
import { DiceService } from "./dice.service";
import { DiceGateway } from "./dice.gateway";

@Module({
  imports: [PrismaModule, WalletModule, AdminModule, JwtModule],
  controllers: [DiceController],
  providers: [DiceService, DiceGateway],
  exports: [DiceService],
})
export class DiceModule {}

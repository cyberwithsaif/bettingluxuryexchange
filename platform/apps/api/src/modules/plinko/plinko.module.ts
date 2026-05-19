import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../../common/prisma/prisma.module";
import { WalletModule } from "../wallet/wallet.module";
import { AdminModule } from "../admin/admin.module";
import { PlinkoController } from "./plinko.controller";
import { PlinkoService } from "./plinko.service";
import { PlinkoGateway } from "./plinko.gateway";

@Module({
  imports: [PrismaModule, WalletModule, AdminModule, JwtModule],
  controllers: [PlinkoController],
  providers: [PlinkoService, PlinkoGateway],
  exports: [PlinkoService],
})
export class PlinkoModule {}

import { Module } from "@nestjs/common";
import { PrismaModule } from "../../common/prisma/prisma.module";
import { WalletModule } from "../wallet/wallet.module";
import { MinesController } from "./mines.controller";
import { MinesService } from "./mines.service";
import { MinesGateway } from "./mines.gateway";
import { JwtModule } from "@nestjs/jwt";

@Module({
  imports: [PrismaModule, WalletModule, JwtModule],
  controllers: [MinesController],
  providers: [MinesService, MinesGateway],
  exports: [MinesService],
})
export class MinesModule {}

import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../../common/prisma/prisma.module";
import { WalletModule } from "../wallet/wallet.module";
import { RouletteService } from "./roulette.service";
import { RouletteController } from "./roulette.controller";
import { RouletteGateway } from "./roulette.gateway";

@Module({
  imports: [
    PrismaModule,
    WalletModule,
    JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET ?? "dev-access-secret",
      signOptions: { expiresIn: Number(process.env.JWT_ACCESS_TTL ?? 900) },
    }),
  ],
  controllers: [RouletteController],
  providers: [RouletteService, RouletteGateway],
  exports: [RouletteService],
})
export class RouletteModule {}

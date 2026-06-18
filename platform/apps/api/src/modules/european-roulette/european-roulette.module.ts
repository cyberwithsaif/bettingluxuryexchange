import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../../common/prisma/prisma.module";
import { WalletModule } from "../wallet/wallet.module";
import { EuropeanRouletteService } from "./european-roulette.service";
import { EuropeanRouletteController } from "./european-roulette.controller";
import { EuropeanRouletteGateway } from "./european-roulette.gateway";

@Module({
  imports: [
    PrismaModule,
    WalletModule,
    JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET ?? "dev-access-secret",
      signOptions: { expiresIn: Number(process.env.JWT_ACCESS_TTL ?? 900) },
    }),
  ],
  controllers: [EuropeanRouletteController],
  providers: [EuropeanRouletteService, EuropeanRouletteGateway],
  exports: [EuropeanRouletteService],
})
export class EuropeanRouletteModule {}

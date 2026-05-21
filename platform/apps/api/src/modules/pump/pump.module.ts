import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../../common/prisma/prisma.module";
import { WalletModule } from "../wallet/wallet.module";
import { PumpController } from "./pump.controller";
import { PumpService } from "./pump.service";
import { PumpGateway } from "./pump.gateway";

@Module({
  imports: [
    PrismaModule,
    WalletModule,
    JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET ?? "dev-access-secret",
      signOptions: { expiresIn: Number(process.env.JWT_ACCESS_TTL ?? 900) },
    }),
  ],
  controllers: [PumpController],
  providers: [PumpService, PumpGateway],
  exports: [PumpService],
})
export class PumpModule {}

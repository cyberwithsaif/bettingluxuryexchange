import { Module } from "@nestjs/common";
import { BettingService } from "./betting.service";
import { BettingController } from "./betting.controller";
import { WalletModule } from "../wallet/wallet.module";
import { ExposureModule } from "../exposure/exposure.module";

@Module({
  imports: [WalletModule, ExposureModule],
  providers: [BettingService],
  controllers: [BettingController],
  exports: [BettingService],
})
export class BettingModule {}

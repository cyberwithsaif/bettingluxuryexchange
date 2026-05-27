import { Module } from "@nestjs/common";
import { CasinoService } from "./casino.service";
import { SlotsLaunchService } from "./slotslaunch.service";
import { CasinoController } from "./casino.controller";
import { WalletModule } from "../wallet/wallet.module";

@Module({
  imports: [WalletModule],
  providers: [CasinoService, SlotsLaunchService],
  controllers: [CasinoController],
  exports: [CasinoService],
})
export class CasinoModule {}

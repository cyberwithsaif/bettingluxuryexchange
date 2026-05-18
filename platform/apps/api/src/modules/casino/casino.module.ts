import { Module } from "@nestjs/common";
import { CasinoService } from "./casino.service";
import { CasinoController } from "./casino.controller";
import { WalletModule } from "../wallet/wallet.module";

@Module({
  imports: [WalletModule],
  providers: [CasinoService],
  controllers: [CasinoController],
  exports: [CasinoService],
})
export class CasinoModule {}

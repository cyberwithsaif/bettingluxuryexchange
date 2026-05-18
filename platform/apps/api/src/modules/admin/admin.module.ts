import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { ApiKeysService } from "./api-keys/api-keys.service";
import { ApiKeysController } from "./api-keys/api-keys.controller";
import { TransactionsController } from "./transactions/transactions.controller";
import { TransactionsService } from "./transactions/transactions.service";
import { WalletModule } from "../wallet/wallet.module";
import { MarketsModule } from "../markets/markets.module";
import { SettlementModule } from "../settlement/settlement.module";
import { CasinoModule } from "../casino/casino.module";

@Module({
  imports: [WalletModule, MarketsModule, SettlementModule, CasinoModule],
  controllers: [AdminController, ApiKeysController, TransactionsController],
  providers: [AdminService, ApiKeysService, TransactionsService],
  exports: [AdminService, ApiKeysService, TransactionsService],
})
export class AdminModule {}

import { Module } from "@nestjs/common";
import { WalletModule } from "../wallet/wallet.module";
import { BookieService } from "./bookie.service";
import { AdminBookieController } from "./admin-bookie.controller";
import { BookieController } from "./bookie.controller";

@Module({
  imports: [WalletModule],
  controllers: [AdminBookieController, BookieController],
  providers: [BookieService],
  exports: [BookieService],
})
export class BookieModule {}

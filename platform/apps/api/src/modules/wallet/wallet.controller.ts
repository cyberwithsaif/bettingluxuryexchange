import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, AuthUser } from "../../common/decorators/current-user.decorator";
import { WalletService } from "./wallet.service";

@UseGuards(JwtAuthGuard)
@Controller("wallet")
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get("summary")
  summary(@CurrentUser() user: AuthUser) {
    return this.wallet.getSummary(user.id);
  }

  @Get("ledger")
  ledger(@CurrentUser() user: AuthUser, @Query("cursor") cursor?: string, @Query("limit") limit?: string) {
    return this.wallet.ledger(user.id, { cursor, limit: limit ? Number(limit) : undefined });
  }
}

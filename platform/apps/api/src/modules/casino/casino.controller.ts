import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, AuthUser } from "../../common/decorators/current-user.decorator";
import { CasinoService } from "./casino.service";
import { CasinoCategory, CasinoTxKind } from "@prisma/client";
import { IsEnum, IsNumber, IsOptional, IsString } from "class-validator";

class WalletCbDto {
  @IsString() providerToken!: string;
  @IsEnum(CasinoTxKind) kind!: CasinoTxKind;
  @IsNumber() amount!: number;
  @IsString() externalRef!: string;
  @IsOptional() @IsString() roundId?: string;
}

@Controller("casino")
export class CasinoController {
  constructor(private readonly casino: CasinoService) {}

  @Get("games")
  games(
    @Query("category") categoryRaw?: string,
    @Query("provider") providerKey?: string,
    @Query("q") q?: string,
  ) {
    const upper = categoryRaw?.toUpperCase() as CasinoCategory | undefined;
    const validCategories = Object.values(CasinoCategory) as string[];
    const category = upper && validCategories.includes(upper) ? upper : undefined;
    return this.casino.listGames({ category, providerKey, q });
  }

  @Get("providers")
  providers() {
    return this.casino.listProviders();
  }

  @UseGuards(JwtAuthGuard)
  @Post("session/:gameId")
  open(@CurrentUser() user: AuthUser, @Param("gameId") gameId: string) {
    return this.casino.openSession(user.id, gameId);
  }

  // Provider → platform wallet webhook.
  // In production this is HMAC-signed and bound to the provider's IP whitelist.
  @Post("wallet-callback")
  cb(@Body() dto: WalletCbDto) {
    return this.casino.walletCallback(dto);
  }
}

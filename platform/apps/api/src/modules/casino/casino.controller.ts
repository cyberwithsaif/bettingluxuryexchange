import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser, AuthUser } from "../../common/decorators/current-user.decorator";
import { CasinoService } from "./casino.service";
import { SlotsLaunchService } from "./slotslaunch.service";
import { CasinoCategory, CasinoTxKind, UserRole } from "@prisma/client";
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
  constructor(
    private readonly casino: CasinoService,
    private readonly slotslaunch: SlotsLaunchService,
  ) {}

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

  // Demo-game launch (SlotsLaunch) — returns the domain-locked iframe URL.
  @UseGuards(JwtAuthGuard)
  @Get("games/:id/launch")
  launch(@Param("id") id: string) {
    return this.slotslaunch.launchUrl(id);
  }

  // Admin: pull the SlotsLaunch demo catalogue into our games table.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post("slotslaunch/sync")
  syncSlotsLaunch() {
    return this.slotslaunch.syncGames();
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

import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { IsString, MinLength } from "class-validator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser, AuthUser } from "../../common/decorators/current-user.decorator";
import { UserRole } from "@prisma/client";
import { BookieService } from "./bookie.service";
import { CreateBookieUserDto, TransferDto, SetStatusDto } from "./dto";

class ResetPwdDto { @IsString() @MinLength(8) password!: string; }

/**
 * Bookie self-service surface. Guarded for BOOKIE and above. Every method is
 * scoped to the caller's own id (the bookie can only see/act on their downline).
 * Routes live under /api/bookie/*.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.BOOKIE)
@Controller("bookie")
export class BookieController {
  constructor(private readonly bookies: BookieService) {}

  @Get("dashboard")
  dashboard(@CurrentUser() me: AuthUser) {
    return this.bookies.dashboard(me.id);
  }

  @Get("profile")
  profile(@CurrentUser() me: AuthUser) {
    return this.bookies.profile(me.id);
  }

  @Get("wallet")
  wallet(@CurrentUser() me: AuthUser) {
    return this.bookies.myWallet(me.id);
  }

  @Get("transactions")
  transactions(@CurrentUser() me: AuthUser) {
    return this.bookies.myTransactions(me.id);
  }

  @Get("users")
  users(@CurrentUser() me: AuthUser, @Query("q") q?: string) {
    return this.bookies.myUsers(me.id, { q });
  }

  @Post("users")
  createUser(@CurrentUser() me: AuthUser, @Body() dto: CreateBookieUserDto, @Req() req: Request) {
    return this.bookies.createUser(me.id, dto, req.ip);
  }

  @Post("transfer")
  transfer(@CurrentUser() me: AuthUser, @Body() dto: TransferDto, @Req() req: Request) {
    return this.bookies.transfer(me.id, dto, req.ip);
  }

  @Patch("users/:id/status")
  setUserStatus(@CurrentUser() me: AuthUser, @Param("id") id: string, @Body() dto: SetStatusDto, @Req() req: Request) {
    return this.bookies.setUserStatus(me.id, id, dto.status, req.ip);
  }

  @Patch("users/:id/password")
  resetPwd(@CurrentUser() me: AuthUser, @Param("id") id: string, @Body() dto: ResetPwdDto, @Req() req: Request) {
    return this.bookies.resetUserPassword(me.id, id, dto.password, req.ip);
  }
}

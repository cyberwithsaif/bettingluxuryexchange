import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser, AuthUser } from "../../common/decorators/current-user.decorator";
import { UserRole } from "@prisma/client";
import { BookieService } from "./bookie.service";
import { CreateBookieDto, UpdateBookieDto, RechargeDto, SetStatusDto, DefaultCommissionDto } from "./dto";

class RequestActionDto {
  @IsIn(["approve", "reject"]) action!: "approve" | "reject";
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

/**
 * Admin → Bookie management. Guarded for ADMIN and above (rank-based guard, so
 * SUPER_ADMIN is included). Routes live under /api/admin/bookies/*.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller("admin/bookies")
export class AdminBookieController {
  constructor(private readonly bookies: BookieService) {}

  @Get()
  list(@Query("q") q?: string) {
    return this.bookies.listBookies({ q });
  }

  @Post()
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateBookieDto, @Req() req: Request) {
    return this.bookies.createBookie(actor.id, dto, req.ip);
  }

  // NOTE: literal routes must precede the ":id" routes below or they'd be
  // captured as an id param.
  @Get("settings")
  getSettings() {
    return this.bookies.getSettings();
  }

  // ── Bookie player-change requests ──
  @Get("requests")
  requests(@Query("status") status?: string) {
    return this.bookies.listBookieRequests({ status });
  }

  @Post("requests/:ticketId/action")
  actionRequest(@CurrentUser() actor: AuthUser, @Param("ticketId") ticketId: string, @Body() dto: RequestActionDto, @Req() req: Request) {
    return this.bookies.actionBookieRequest(actor.id, ticketId, dto.action, dto.note, req.ip);
  }

  @Patch("settings")
  saveSettings(@CurrentUser() actor: AuthUser, @Body() dto: DefaultCommissionDto, @Req() req: Request) {
    return this.bookies.saveSettings(actor.id, Math.round((dto.defaultCommissionPct ?? 0) * 100), req.ip);
  }

  @Get(":id")
  detail(@Param("id") id: string) {
    return this.bookies.getBookieDetail(id);
  }

  @Get(":id/users")
  users(@Param("id") id: string) {
    return this.bookies.bookieUsers(id);
  }

  @Get(":id/wallet-logs")
  walletLogs(@Param("id") id: string) {
    return this.bookies.walletLogs(id);
  }

  @Get(":id/activity")
  activity(@Param("id") id: string) {
    return this.bookies.activity(id);
  }

  @Patch(":id")
  update(@CurrentUser() actor: AuthUser, @Param("id") id: string, @Body() dto: UpdateBookieDto, @Req() req: Request) {
    return this.bookies.updateBookie(actor.id, id, dto, req.ip);
  }

  @Post(":id/recharge")
  recharge(@CurrentUser() actor: AuthUser, @Param("id") id: string, @Body() dto: RechargeDto, @Req() req: Request) {
    return this.bookies.recharge(actor.id, id, dto, req.ip);
  }

  @Patch(":id/status")
  setStatus(@CurrentUser() actor: AuthUser, @Param("id") id: string, @Body() dto: SetStatusDto, @Req() req: Request) {
    return this.bookies.setBookieStatus(actor.id, id, dto.status, req.ip);
  }

  @Post(":id/force-logout")
  forceLogout(@CurrentUser() actor: AuthUser, @Param("id") id: string, @Req() req: Request) {
    return this.bookies.forceLogout(actor.id, id, req.ip);
  }
}

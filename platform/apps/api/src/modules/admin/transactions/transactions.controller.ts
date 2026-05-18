import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { RolesGuard } from "../../../common/guards/roles.guard";
import { Roles } from "../../../common/decorators/roles.decorator";
import { CurrentUser, AuthUser } from "../../../common/decorators/current-user.decorator";
import { TransactionKind, TransactionMethod, TransactionStatus, UserRole } from "@prisma/client";
import { TransactionsService } from "./transactions.service";
import { AdminService } from "../admin.service";
import { IsEnum, IsNumber, IsOptional, IsString, Min } from "class-validator";

class CreateTxDto {
  @IsEnum(TransactionKind) kind!: TransactionKind;
  @IsEnum(TransactionMethod) method!: TransactionMethod;
  @IsNumber() @Min(1) amount!: number;
  @IsOptional() @IsString() reference?: string;
}

class RejectDto { @IsOptional() @IsString() reason?: string; }

@Controller()
export class TransactionsController {
  constructor(
    private readonly txs: TransactionsService,
    private readonly admin: AdminService,
  ) {}

  // --- USER side ---
  @UseGuards(JwtAuthGuard)
  @Post("transactions")
  request(@CurrentUser() user: AuthUser, @Body() dto: CreateTxDto) {
    return this.txs.request(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get("transactions/mine")
  mine(@CurrentUser() user: AuthUser) {
    return this.txs.list({ userId: user.id });
  }

  // --- ADMIN side ---
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get("admin/transactions")
  list(@Query("status") status?: TransactionStatus, @Query("kind") kind?: TransactionKind) {
    return this.txs.list({ status, kind });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post("admin/transactions/:id/approve")
  async approve(@CurrentUser() actor: AuthUser, @Param("id") id: string, @Req() req: Request) {
    const r = await this.txs.approve(id, actor.id);
    await this.admin.writeAudit(actor.id, "transaction.approve", { type: "transaction", id }, undefined, req.ip);
    return r;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post("admin/transactions/:id/reject")
  async reject(@CurrentUser() actor: AuthUser, @Param("id") id: string, @Body() dto: RejectDto, @Req() req: Request) {
    const r = await this.txs.reject(id, actor.id, dto.reason);
    await this.admin.writeAudit(actor.id, "transaction.reject", { type: "transaction", id }, dto, req.ip);
    return r;
  }
}

import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser, AuthUser } from "../../common/decorators/current-user.decorator";
import { UsersService } from "./users.service";
import { UserRole, UserStatus } from "@prisma/client";
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength } from "class-validator";

class CreateDownlineDto {
  @IsString() @MinLength(3) username!: string;
  @IsString() @MinLength(8) password!: string;
  @IsEnum(UserRole) role!: UserRole;
  @IsOptional() @IsInt() @Min(0) @Max(10_000) partnershipBps?: number;
  @IsOptional() @IsNumber() creditReference?: number;
}

class SetStatusDto { @IsEnum(UserStatus) status!: UserStatus; }
class ResetPasswordDto { @IsString() @MinLength(8) password!: string; }

class UpdateDownlineDto {
  @IsOptional() @IsEnum(UserRole) role?: UserRole;
  @IsOptional() @IsInt() @Min(0) @Max(10_000) partnershipBps?: number;
  @IsOptional() @IsNumber() creditReference?: number;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.AGENT, UserRole.MASTER, UserRole.SUPER_MASTER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post("downline")
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateDownlineDto) {
    return this.users.createDownline(actor.id, dto);
  }

  @Get("downline")
  list(@CurrentUser() actor: AuthUser, @Query("q") q?: string, @Query("role") role?: UserRole) {
    return this.users.listDownline(actor.id, { q, role });
  }

  @Patch(":id/status")
  setStatus(@CurrentUser() actor: AuthUser, @Param("id") id: string, @Body() dto: SetStatusDto) {
    return this.users.setStatus(actor.id, id, dto.status);
  }

  @Patch(":id/password")
  resetPwd(@CurrentUser() actor: AuthUser, @Param("id") id: string, @Body() dto: ResetPasswordDto) {
    return this.users.resetPassword(actor.id, id, dto.password);
  }

  @Patch(":id/limits")
  setLimits(@CurrentUser() actor: AuthUser, @Param("id") id: string, @Body() patch: Record<string, any>) {
    return this.users.updateLimits(actor.id, id, patch);
  }

  @Patch(":id")
  update(@CurrentUser() actor: AuthUser, @Param("id") id: string, @Body() dto: UpdateDownlineDto) {
    return this.users.updateUser(actor.id, id, dto);
  }
}

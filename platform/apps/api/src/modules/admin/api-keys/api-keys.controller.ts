import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { RolesGuard } from "../../../common/guards/roles.guard";
import { Roles } from "../../../common/decorators/roles.decorator";
import { CurrentUser, AuthUser } from "../../../common/decorators/current-user.decorator";
import { UserRole } from "@prisma/client";
import { ApiKeysService } from "./api-keys.service";
import { AdminService } from "../admin.service";
import { IsBoolean, IsObject, IsOptional, IsString } from "class-validator";

class UpsertApiKeyDto {
  @IsString() providerKey!: string;
  @IsObject() fields!: Record<string, string>;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsString() notes?: string;
}

class ToggleDto { @IsBoolean() enabled!: boolean; }

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller("admin/api-keys")
export class ApiKeysController {
  constructor(
    private readonly keys: ApiKeysService,
    private readonly admin: AdminService,
  ) {}

  @Get("catalogue")
  catalogue() { return this.keys.catalogue(); }

  @Get()
  list() { return this.keys.list(); }

  @Post()
  async upsert(@CurrentUser() actor: AuthUser, @Body() dto: UpsertApiKeyDto, @Req() req: Request) {
    const r = await this.keys.upsert({ ...dto, actorId: actor.id });
    await this.admin.writeAudit(actor.id, "apikey.upsert", { type: "apikey", id: r.id }, { providerKey: dto.providerKey }, req.ip);
    return r;
  }

  @Patch(":providerKey/toggle")
  async toggle(@CurrentUser() actor: AuthUser, @Param("providerKey") providerKey: string, @Body() dto: ToggleDto, @Req() req: Request) {
    const r = await this.keys.toggle(providerKey, dto.enabled);
    await this.admin.writeAudit(actor.id, "apikey.toggle", { type: "apikey", id: r.id }, dto, req.ip);
    return r;
  }

  @Delete(":providerKey")
  async remove(@CurrentUser() actor: AuthUser, @Param("providerKey") providerKey: string, @Req() req: Request) {
    const r = await this.keys.remove(providerKey);
    await this.admin.writeAudit(actor.id, "apikey.delete", { type: "apikey", id: providerKey }, undefined, req.ip);
    return r;
  }
}

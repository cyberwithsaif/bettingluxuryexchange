import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { UserRole } from "@prisma/client";
import { AnnouncementsService } from "./announcements.service";
import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, MinLength } from "class-validator";

class CreateAnnouncementDto {
  @IsString() @MinLength(5) text!: string;
  @IsOptional() @IsIn(["info", "warn", "promo"]) level?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() endsAt?: string;
}

class UpdateAnnouncementDto {
  @IsOptional() @IsString() @MinLength(5) text?: string;
  @IsOptional() @IsIn(["info", "warn", "promo"]) level?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsDateString() startsAt?: string | null;
  @IsOptional() @IsDateString() endsAt?: string | null;
}

@Controller("announcements")
export class AnnouncementsController {
  constructor(private readonly svc: AnnouncementsService) {}

  /** Public — no auth required */
  @Get("active")
  active() {
    return this.svc.listActive();
  }

  /** Admin only from here */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get()
  list(
    @Query("limit") limit?: string,
    @Query("skip") skip?: string,
  ) {
    return this.svc.listAll({ limit: limit ? Number(limit) : undefined, skip: skip ? Number(skip) : undefined });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post()
  create(@Body() dto: CreateAnnouncementDto) {
    return this.svc.create({
      text: dto.text,
      level: dto.level,
      active: dto.active,
      startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
      endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateAnnouncementDto) {
    return this.svc.update(id, {
      text: dto.text,
      level: dto.level,
      active: dto.active,
      startsAt: dto.startsAt !== undefined ? (dto.startsAt ? new Date(dto.startsAt) : null) : undefined,
      endsAt: dto.endsAt !== undefined ? (dto.endsAt ? new Date(dto.endsAt) : null) : undefined,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.svc.remove(id);
  }
}

import {
  Body, Controller, Get, Post, Param, Query,
  UseGuards, BadRequestException,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { PumpService } from "./pump.service";
import { UserRole, PumpDifficulty } from "@prisma/client";

class PlaceBetDto {
  betAmount!: number;
  difficulty!: string;
  clientSeed?: string;
}

class PumpDto {
  betId!: string;
}

class CashoutDto {
  betId!: string;
}

class SaveConfigDto {
  enabled?: boolean;
  minBet?: number;
  maxBet?: number;
  maxPayout?: number;
  rtpPercent?: number;
  difficulties?: any;
  forceWinUsername?: string | null;  // by username (admin friendly)
  forceWinPumps?: number | null;
  forceLossUsername?: string | null;
  forceNextPopPump?: number | null;
}

function parseDifficulty(s: string): PumpDifficulty {
  const up = (s ?? "").toUpperCase();
  if (up === "EASY" || up === "MEDIUM" || up === "HARD" || up === "EXPERT" || up === "INSANE") {
    return up as PumpDifficulty;
  }
  throw new BadRequestException("Invalid difficulty");
}

@SkipThrottle()
@Controller("casino/pump")
export class PumpController {
  constructor(private readonly service: PumpService) {}

  // ── Public ──────────────────────────────────────────────────

  @Get("config")
  async publicConfig() {
    const c = await this.service.getConfig();
    return {
      enabled:    c.enabled,
      minBet:     c.minBet,
      maxBet:     c.maxBet,
      maxPayout:  c.maxPayout,
      rtpPercent: c.rtpPercent,
      difficulties: c.difficulties,
    };
  }

  @Get("difficulty/:difficulty")
  async difficultyTable(@Param("difficulty") difficulty: string) {
    return this.service.getMultTableForDifficulty(parseDifficulty(difficulty));
  }

  @Get("history")
  async history(@Query("limit") limit?: string) {
    const n = limit ? Math.min(50, Math.max(1, Number(limit))) : 30;
    return this.service.getRecentSettled(n);
  }

  @Get("verify/:betId")
  async verify(@Param("betId") betId: string) {
    return this.service.verifySession(betId);
  }

  // ── Authed ──────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get("active")
  async active(@CurrentUser() user: any) {
    return this.service.getActiveSession(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post("bet")
  async placeBet(@CurrentUser() user: any, @Body() dto: PlaceBetDto) {
    return this.service.placeBet(user.id, {
      betAmount: Number(dto.betAmount),
      difficulty: parseDifficulty(dto.difficulty),
      clientSeed: dto.clientSeed,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post("pump")
  async pump(@CurrentUser() user: any, @Body() dto: PumpDto) {
    return this.service.pump(user.id, dto.betId);
  }

  @UseGuards(JwtAuthGuard)
  @Post("cashout")
  async cashout(@CurrentUser() user: any, @Body() dto: CashoutDto) {
    return this.service.cashout(user.id, dto.betId);
  }

  @UseGuards(JwtAuthGuard)
  @Get("my-bets")
  async myBets(@CurrentUser() user: any, @Query("limit") limit?: string) {
    const n = limit ? Math.min(200, Math.max(1, Number(limit))) : 50;
    return this.service.getUserBets(user.id, n);
  }

  // ── Admin ───────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get("admin/config")
  adminConfig() {
    return this.service.getConfig();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post("admin/config")
  async saveConfig(@Body() dto: SaveConfigDto) {
    // Resolve usernames to user IDs for force-win/loss
    const patch: any = {};
    if (dto.enabled       != null) patch.enabled = Boolean(dto.enabled);
    if (dto.minBet        != null) patch.minBet = Number(dto.minBet);
    if (dto.maxBet        != null) patch.maxBet = Number(dto.maxBet);
    if (dto.maxPayout     != null) patch.maxPayout = Number(dto.maxPayout);
    if (dto.rtpPercent    != null) patch.rtpPercent = Number(dto.rtpPercent);
    if (dto.difficulties  != null) patch.difficulties = dto.difficulties;
    if (dto.forceNextPopPump !== undefined) {
      patch.forceNextPopPump = dto.forceNextPopPump != null ? Number(dto.forceNextPopPump) : null;
    }
    if (dto.forceWinUsername !== undefined) {
      if (dto.forceWinUsername == null || dto.forceWinUsername === "") {
        patch.forceWinUserId = null;
        patch.forceWinPumps  = null;
      } else {
        const u = await this.service.findUserByUsername(dto.forceWinUsername);
        if (!u) throw new BadRequestException(`User '${dto.forceWinUsername}' not found`);
        patch.forceWinUserId = u.id;
        patch.forceWinPumps  = dto.forceWinPumps != null ? Number(dto.forceWinPumps) : 5;
      }
    }
    if (dto.forceLossUsername !== undefined) {
      if (dto.forceLossUsername == null || dto.forceLossUsername === "") {
        patch.forceLossUserId = null;
      } else {
        const u = await this.service.findUserByUsername(dto.forceLossUsername);
        if (!u) throw new BadRequestException(`User '${dto.forceLossUsername}' not found`);
        patch.forceLossUserId = u.id;
      }
    }
    return this.service.saveConfig(patch);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get("admin/stats")
  adminStats() {
    return this.service.getAdminStats();
  }
}

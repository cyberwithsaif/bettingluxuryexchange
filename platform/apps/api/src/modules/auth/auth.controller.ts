import { Body, Controller, Post, Req, UseGuards, Get } from "@nestjs/common";
import type { Request } from "express";
import { AuthService } from "./auth.service";
import { EnableTwoFaDto, LoginDto, RefreshDto, RegisterDto } from "./dto";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { CurrentUser, AuthUser } from "../../common/decorators/current-user.decorator";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.auth.register(dto, req.ip);
  }

  @Post("login")
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto, req.ip, req.headers["user-agent"]);
  }

  @Post("refresh")
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post("logout")
  logout(@Body() dto: RefreshDto) {
    return this.auth.logout(dto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  @UseGuards(JwtAuthGuard)
  @Post("2fa/start")
  start2fa(@CurrentUser() user: AuthUser) {
    return this.auth.start2fa(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post("2fa/enable")
  enable2fa(@CurrentUser() user: AuthUser, @Body() dto: EnableTwoFaDto) {
    return this.auth.enable2fa(user.id, dto.otp);
  }
}

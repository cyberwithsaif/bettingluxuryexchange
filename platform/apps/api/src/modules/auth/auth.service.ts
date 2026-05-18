import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import * as crypto from "crypto";
import * as speakeasy from "speakeasy";
import * as qrcode from "qrcode";
import { PrismaService } from "../../common/prisma/prisma.service";
import { LoginDto, RegisterDto } from "./dto";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto, ip?: string) {
    const exists = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (exists) throw new ConflictException("Username already taken");

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        email: dto.email,
        phone: dto.phone,
        passwordHash,
        lastLoginIp: ip,
        wallet: { create: {} },
        limits: { create: {} },
      },
      select: { id: true, username: true, role: true },
    });
    return this.issueTokens(user.id, user.username, user.role);
  }

  async login(dto: LoginDto, ip?: string, ua?: string) {
    const user = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (!user) throw new UnauthorizedException("Invalid credentials");
    if (user.status !== "ACTIVE") throw new UnauthorizedException(`Account ${user.status.toLowerCase()}`);

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException("Invalid credentials");

    if (user.twoFactorEnabled) {
      if (!dto.otp) throw new UnauthorizedException("OTP required");
      const verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret!,
        encoding: "base32",
        token: dto.otp,
        window: 1,
      });
      if (!verified) throw new UnauthorizedException("Invalid OTP");
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), lastLoginIp: ip ?? null },
    });

    return this.issueTokens(user.id, user.username, user.role, ip, ua);
  }

  async refresh(refreshToken: string) {
    const tokenHash = sha256(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException("Invalid refresh token");
    }
    const user = await this.prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user || user.status !== "ACTIVE") throw new UnauthorizedException();

    // Rotate: revoke old, issue new.
    await this.prisma.refreshToken.update({
      where: { tokenHash },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens(user.id, user.username, user.role);
  }

  async logout(refreshToken: string) {
    const tokenHash = sha256(refreshToken);
    await this.prisma.refreshToken
      .update({ where: { tokenHash }, data: { revokedAt: new Date() } })
      .catch(() => undefined);
    return { ok: true };
  }

  // -- 2FA --
  async start2fa(userId: string) {
    const secret = speakeasy.generateSecret({ name: `ExchPlatform (${userId.slice(0, 8)})` });
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret.base32, twoFactorEnabled: false },
    });
    const otpauth = secret.otpauth_url!;
    const qr = await qrcode.toDataURL(otpauth);
    return { otpauth, qr };
  }

  async enable2fa(userId: string, otp: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u?.twoFactorSecret) throw new BadRequestException("2FA not initialized");
    const ok = speakeasy.totp.verify({ secret: u.twoFactorSecret, encoding: "base32", token: otp, window: 1 });
    if (!ok) throw new UnauthorizedException("Invalid OTP");
    await this.prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: true } });
    return { ok: true };
  }

  private async issueTokens(userId: string, username: string, role: string, ip?: string, ua?: string) {
    const accessToken = this.jwt.sign({ sub: userId, username, role });
    const refreshToken = crypto.randomBytes(48).toString("base64url");
    const refreshTtl = Number(process.env.JWT_REFRESH_TTL ?? 2_592_000);
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: sha256(refreshToken),
        ip,
        userAgent: ua,
        expiresAt: new Date(Date.now() + refreshTtl * 1000),
      },
    });
    return { accessToken, refreshToken, user: { id: userId, username, role } };
  }
}

function sha256(s: string) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

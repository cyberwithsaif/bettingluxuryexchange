import { Injectable, UnauthorizedException, ConflictException, BadRequestException, ForbiddenException } from "@nestjs/common";
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

  /** Platform on/off flags from admin Settings (SystemConfig key "platform"). */
  private async platformFlags(): Promise<{ maintenanceMode: boolean; registrationEnabled: boolean }> {
    const row = await this.prisma.systemConfig.findUnique({ where: { key: "platform" } });
    const v = (row?.value ?? {}) as Record<string, unknown>;
    return {
      maintenanceMode: v.maintenanceMode === true,
      registrationEnabled: v.registrationEnabled !== false, // default ON
    };
  }

  /**
   * Resolve a Refer & Earn code back to the referring user. Codes are derived
   * (not stored): UPPERCASE(username[0..6]) + last 4 chars of the user id —
   * see UsersService.getReferral. Returns null for unknown/invalid codes.
   */
  private async resolveReferralCode(code?: string): Promise<string | null> {
    const c = (code ?? "").trim();
    if (c.length < 5 || c.length > 40) return null;
    const idTail = c.slice(-4).toLowerCase();
    const prefix = c.slice(0, -4).toUpperCase();
    // orderBy makes a (vanishingly unlikely) id-tail + username-prefix
    // collision resolve deterministically to the older account.
    const candidates = await this.prisma.user.findMany({
      where: { id: { endsWith: idTail } },
      select: { id: true, username: true },
      orderBy: { createdAt: "asc" },
      take: 10,
    });
    const match = candidates.find(u => u.username.toUpperCase().slice(0, 6) === prefix);
    return match?.id ?? null;
  }

  async register(dto: RegisterDto, ip?: string) {
    const flags = await this.platformFlags();
    if (flags.maintenanceMode) throw new ForbiddenException("Site is under maintenance. Please try again later.");
    if (!flags.registrationEnabled) throw new ForbiddenException("New registrations are currently disabled.");

    const exists = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (exists) throw new ConflictException("Username already taken");

    const referredById = await this.resolveReferralCode(dto.referralCode).catch(() => null);

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        email: dto.email,
        phone: dto.phone,
        passwordHash,
        lastLoginIp: ip,
        referredById: referredById ?? undefined,
        wallet: { create: {} },
        limits: { create: {} },
      },
      select: { id: true, username: true, role: true },
    });
    return this.issueTokens(user.id, user.username, user.role, 0);
  }

  async login(dto: LoginDto, ip?: string, ua?: string) {
    const user = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (!user) throw new UnauthorizedException("Invalid credentials");
    if (user.status !== "ACTIVE") throw new UnauthorizedException(`Account ${user.status.toLowerCase()}`);

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException("Invalid credentials");

    // Maintenance mode: only staff (ADMIN/SUPER_ADMIN) may sign in.
    const flags = await this.platformFlags();
    if (flags.maintenanceMode && user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      throw new UnauthorizedException("Site is under maintenance. Please try again later.");
    }

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

    return this.issueTokens(user.id, user.username, user.role, user.tokenVersion, ip, ua);
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
    return this.issueTokens(user.id, user.username, user.role, user.tokenVersion);
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

  async disable2fa(userId: string, otp: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u?.twoFactorEnabled || !u.twoFactorSecret) throw new BadRequestException("2FA is not enabled");
    const ok = speakeasy.totp.verify({ secret: u.twoFactorSecret, encoding: "base32", token: otp, window: 1 });
    if (!ok) throw new UnauthorizedException("Invalid OTP");
    await this.prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: false, twoFactorSecret: null } });
    return { ok: true };
  }

  // -- Security overview --
  async getSecurityOverview(userId: string) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, email: true, phone: true, twoFactorEnabled: true, lastLoginAt: true, lastLoginIp: true, createdAt: true },
    });
    if (!u) throw new UnauthorizedException();
    const activeSessions = await this.prisma.refreshToken.count({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    return { ...u, activeSessions };
  }

  // -- Password --
  async changePassword(userId: string, currentPassword: string, newPassword: string, ip?: string, ua?: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u) throw new UnauthorizedException();
    const ok = await bcrypt.compare(currentPassword, u.passwordHash);
    if (!ok) throw new UnauthorizedException("Current password is incorrect");
    if (await bcrypt.compare(newPassword, u.passwordHash)) {
      throw new BadRequestException("New password must be different from the current one");
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    // Bump tokenVersion so every existing access token is invalidated immediately.
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, tokenVersion: { increment: 1 } },
      select: { tokenVersion: true },
    });
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    return this.issueTokens(u.id, u.username, u.role, updated.tokenVersion, ip, ua);
  }

  // -- Sessions --
  async listSessions(userId: string) {
    return this.prisma.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true, ip: true, userAgent: true, createdAt: true, expiresAt: true },
    });
  }

  async revokeSession(userId: string, sessionId: string) {
    const s = await this.prisma.refreshToken.findFirst({ where: { id: sessionId, userId } });
    if (!s) throw new BadRequestException("Session not found");
    await this.prisma.refreshToken.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
    return { ok: true };
  }

  async revokeAllSessions(userId: string, ip?: string, ua?: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u) throw new UnauthorizedException();
    // Bump tokenVersion: instantly invalidates every access token on every other
    // device. Refresh tokens are revoked too so they can't silently re-auth.
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
      select: { tokenVersion: true },
    });
    const r = await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    const tokens = await this.issueTokens(u.id, u.username, u.role, updated.tokenVersion, ip, ua);
    return { ...tokens, revoked: r.count };
  }

  private async issueTokens(userId: string, username: string, role: string, tokenVersion: number, ip?: string, ua?: string) {
    const accessToken = this.jwt.sign({ sub: userId, username, role, tv: tokenVersion });
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

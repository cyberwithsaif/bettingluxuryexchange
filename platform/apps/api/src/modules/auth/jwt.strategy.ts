import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "../../common/prisma/prisma.service";
import { jwtSecret } from "../../common/jwt-secret";

interface JwtPayload {
  sub: string;
  username: string;
  role: string;
  tv?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret(),
    });
  }

  async validate(payload: JwtPayload) {
    const u = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, username: true, role: true, status: true, tokenVersion: true },
    });
    if (!u || u.status !== "ACTIVE") throw new UnauthorizedException();
    // Token-version gate: bumping the user's tokenVersion instantly invalidates
    // every access token issued before the bump (used by "sign out all devices").
    if ((payload.tv ?? 0) !== (u.tokenVersion ?? 0)) throw new UnauthorizedException("Session expired");
    return { id: u.id, username: u.username, role: u.role };
  }
}

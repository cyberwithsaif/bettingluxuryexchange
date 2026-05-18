import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";
import { BullModule } from "@nestjs/bullmq";

import { PrismaModule } from "./common/prisma/prisma.module";
import { RedisModule } from "./common/redis/redis.module";
import { CryptoModule } from "./common/crypto/crypto.module";

import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { WalletModule } from "./modules/wallet/wallet.module";
import { ExposureModule } from "./modules/exposure/exposure.module";
import { BettingModule } from "./modules/betting/betting.module";
import { MarketsModule } from "./modules/markets/markets.module";
import { CasinoModule } from "./modules/casino/casino.module";
import { AdminModule } from "./modules/admin/admin.module";
import { RealtimeModule } from "./modules/realtime/realtime.module";
import { SportsModule } from "./modules/sports/sports.module";
import { SettlementModule } from "./modules/settlement/settlement.module";
import { BootstrapModule } from "./bootstrap/bootstrap.module";
import { AnnouncementsModule } from "./modules/announcements/announcements.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    BullModule.forRoot({
      connection: {
        // ioredis-style URL parsing handled by BullMQ.
        url: process.env.REDIS_URL ?? "redis://localhost:6379",
      },
    }),
    PrismaModule,
    RedisModule,
    CryptoModule,
    AuthModule,
    UsersModule,
    WalletModule,
    ExposureModule,
    BettingModule,
    MarketsModule,
    CasinoModule,
    AdminModule,
    RealtimeModule,
    SportsModule,
    SettlementModule,
    BootstrapModule,
    AnnouncementsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}

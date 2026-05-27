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
import { BookieModule } from "./modules/bookie/bookie.module";
import { RealtimeModule } from "./modules/realtime/realtime.module";
import { SportsModule } from "./modules/sports/sports.module";
import { SettlementModule } from "./modules/settlement/settlement.module";
import { BootstrapModule } from "./bootstrap/bootstrap.module";
import { AnnouncementsModule } from "./modules/announcements/announcements.module";
import { RouletteModule } from "./modules/roulette/roulette.module";
import { MinesModule } from "./modules/mines/mines.module";
import { PlinkoModule } from "./modules/plinko/plinko.module";
import { PumpModule } from "./modules/pump/pump.module";
import { DiceModule } from "./modules/dice/dice.module";
import { TowersModule } from "./modules/towers/towers.module";
import { ChickenRoadModule } from "./modules/chicken-road/chicken-road.module";

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
    BookieModule,
    RealtimeModule,
    SportsModule,
    SettlementModule,
    BootstrapModule,
    AnnouncementsModule,
    RouletteModule,
    MinesModule,
    PlinkoModule,
    PumpModule,
    DiceModule,
    TowersModule,
    ChickenRoadModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}

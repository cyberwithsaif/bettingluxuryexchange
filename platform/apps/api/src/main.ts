import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { RedisIoAdapter } from "./common/socket/redis-io.adapter";
import { json, urlencoded, static as expressStatic } from "express";
import helmet from "helmet";
import { join } from "path";
import { mkdirSync } from "fs";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = new Logger("Bootstrap");

  // Behind nginx — trust the first proxy hop so req.ip uses X-Forwarded-For
  // (the real client IP) instead of 127.0.0.1.
  app.getHttpAdapter().getInstance().set("trust proxy", 1);

  const uploadsDir = process.env.UPLOADS_DIR ?? join(process.cwd(), "uploads");
  mkdirSync(uploadsDir, { recursive: true });
  // Served at /api/uploads/ so nginx's /api/ → port-4000 rule covers it
  app.use("/api/uploads", expressStatic(uploadsDir));

  // Security headers. CSP/CORP are disabled because this is a JSON API behind
  // nginx that also serves upload images cross-origin to the web/admin apps.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));

  app.use(json({ limit: "15mb" }));
  app.use(urlencoded({ extended: true, limit: "15mb" }));


  const origins = (process.env.CORS_ORIGINS ?? "http://localhost:3000,http://localhost:3001")
    .split(",")
    .map((s) => s.trim());

  app.enableCors({
    origin: origins,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  // Redis-backed Socket.io adapter so room broadcasts work across cluster workers.
  const ioAdapter = new RedisIoAdapter(app);
  await ioAdapter.connectToRedis();
  app.useWebSocketAdapter(ioAdapter);

  app.setGlobalPrefix("api");

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port, "0.0.0.0");
  const instance = process.env.NODE_APP_INSTANCE ?? "0";
  logger.log(`API listening on http://0.0.0.0:${port}/api (worker ${instance})`);
}

bootstrap();

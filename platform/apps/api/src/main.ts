import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { RedisIoAdapter } from "./common/socket/redis-io.adapter";
import { json, urlencoded, static as expressStatic } from "express";
import { join } from "path";
import { mkdirSync } from "fs";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = new Logger("Bootstrap");

  const uploadsDir = process.env.UPLOADS_DIR ?? join(process.cwd(), "uploads");
  mkdirSync(uploadsDir, { recursive: true });
  // Served at /api/uploads/ so nginx's /api/ → port-4000 rule covers it
  app.use("/api/uploads", expressStatic(uploadsDir));

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

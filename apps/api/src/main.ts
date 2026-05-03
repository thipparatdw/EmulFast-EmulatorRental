import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { AppModule } from "./app.module.js";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter.js";

const PORT = process.env["PORT"] ?? 4000;
const logger = new Logger("Bootstrap");

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    // ใช้ Pino logger แทน NestJS default
    bufferLogs: true,
    // rawBody เปิดไว้เพื่อให้ Stripe webhook ตรวจ signature ได้
    rawBody: true,
  });

  // Global prefix
  app.setGlobalPrefix("api");

  // CORS
  app.enableCors({
    origin: process.env["CORS_ORIGIN"] ?? "http://localhost:3000",
    credentials: true,
  });

  // WebSocket adapter (Socket.IO)
  app.useWebSocketAdapter(new IoAdapter(app));

  // Global exception filter
  app.useGlobalFilters(new AllExceptionsFilter());

  // Swagger (Dev only)
  if (process.env["NODE_ENV"] !== "production") {
    const config = new DocumentBuilder()
      .setTitle("EmulFast API")
      .setDescription("EmulFast Cloud Android Emulator API")
      .setVersion("0.0.1")
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("api/docs", app, document);
    logger.log(`Swagger docs: http://localhost:${PORT}/api/docs`);
  }

  await app.listen(PORT);
  logger.log(`API server running on http://localhost:${PORT}/api`);
}

void bootstrap();

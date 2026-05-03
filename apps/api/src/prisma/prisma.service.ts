import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from "@nestjs/common";
import { PrismaClient } from "@emulfast/db";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: "event", level: "query" },
        { emit: "event", level: "warn" },
        { emit: "event", level: "error" },
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    this.logger.log("Connecting to database...");
    await this.$connect();
    this.logger.log("Database connected");
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log("Disconnecting from database...");
    await this.$disconnect();
    this.logger.log("Database disconnected");
  }
}

import { Processor, WorkerHost, InjectQueue } from "@nestjs/bullmq";
import { Logger, OnModuleInit } from "@nestjs/common";
import { Job, Queue } from "bullmq";
import { EmulatorService } from "./emulator.service.js";

@Processor("emulator-expiry")
export class EmulatorExpiryProcessor
  extends WorkerHost
  implements OnModuleInit
{
  private readonly logger = new Logger(EmulatorExpiryProcessor.name);

  constructor(
    private readonly emulatorService: EmulatorService,
    @InjectQueue("emulator-expiry") private readonly queue: Queue,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    // ลบ repeatable jobs เดิม (ป้องกัน duplicate เมื่อ restart)
    const repeatableJobs = await this.queue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      await this.queue.removeRepeatableByKey(job.key);
    }

    // Schedule scan ทุก 60 วินาที
    await this.queue.add("scan", {}, { repeat: { every: 60_000 } });
    this.logger.log("Emulator expiry scanner scheduled (every 60s)");
  }

  async process(job: Job): Promise<void> {
    this.logger.debug(`Processing job: ${job.name} id=${job.id}`);

    try {
      await this.emulatorService.recoverProvisioningEmulators();
      await this.emulatorService.terminateOrphanedEmulators();
      await this.emulatorService.processExpiredEmulators();
      await this.emulatorService.warnExpiringEmulators();
    } catch (err) {
      this.logger.error(
        `Expiry scan failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
      // ไม่ throw เพื่อไม่ให้ job retry ซ้ำ (scan job รันทุก 60s อยู่แล้ว)
    }
  }
}

import { Test, TestingModule } from "@nestjs/testing";
import { AppController } from "./app.controller.js";

describe("AppController", () => {
  let controller: AppController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();

    controller = module.get<AppController>(AppController);
  });

  describe("health", () => {
    it("should return status ok", () => {
      const result = controller.health();
      expect(result.status).toBe("ok");
    });

    it("should return an ISO 8601 timestamp", () => {
      const result = controller.health();
      expect(result.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
    });

    it("should return a recent timestamp (within 5 seconds)", () => {
      const before = Date.now();
      const result = controller.health();
      const after = Date.now();

      const ts = new Date(result.timestamp).getTime();
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });
  });
});

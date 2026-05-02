import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

interface HealthResponse {
  status: "ok";
  timestamp: string;
}

@ApiTags("health")
@Controller()
export class AppController {
  @Get("health")
  @ApiOperation({ summary: "Health check endpoint" })
  health(): HealthResponse {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
    };
  }
}

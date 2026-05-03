import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { ZodSchema, ZodError } from "zod";

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  private readonly logger = new Logger(ZodValidationPipe.name);

  constructor(private readonly schema: ZodSchema) {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  transform(value: unknown, _metadata: ArgumentMetadata): unknown {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      const zodError = result.error as ZodError;
      this.logger.debug(
        `Validation failed: ${zodError.message}`,
        ZodValidationPipe.name,
      );

      throw new BadRequestException({
        error: {
          code: "VALIDATION_ERROR",
          message: "Validation failed",
          messageKey: "errors.validation",
          details: zodError.flatten(),
        },
      });
    }

    return result.data;
  }
}

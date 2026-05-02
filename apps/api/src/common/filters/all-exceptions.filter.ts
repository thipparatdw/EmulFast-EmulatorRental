import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Request, Response } from "express";

interface ErrorBody {
  error: {
    code: string;
    message: string;
    messageKey: string;
    details?: unknown;
  };
}

function getErrorCode(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return "VALIDATION_ERROR";
    case HttpStatus.UNAUTHORIZED:
      return "UNAUTHORIZED";
    case HttpStatus.FORBIDDEN:
      return "FORBIDDEN";
    case HttpStatus.NOT_FOUND:
      return "NOT_FOUND";
    case HttpStatus.CONFLICT:
      return "CONFLICT";
    case HttpStatus.TOO_MANY_REQUESTS:
      return "RATE_LIMIT";
    case HttpStatus.PAYMENT_REQUIRED:
      return "PAYMENT_FAILED";
    default:
      return "INTERNAL";
  }
}

function getMessageKey(code: string): string {
  return `errors.${code.toLowerCase()}`;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ErrorBody;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      // ถ้า response เป็น object ที่มี error field อยู่แล้ว (เช่น จาก ZodValidationPipe)
      if (
        typeof exceptionResponse === "object" &&
        exceptionResponse !== null &&
        "error" in exceptionResponse
      ) {
        body = exceptionResponse as ErrorBody;
      } else {
        const code = getErrorCode(status);
        const message =
          typeof exceptionResponse === "string"
            ? exceptionResponse
            : exception.message;

        body = {
          error: {
            code,
            message,
            messageKey: getMessageKey(code),
          },
        };
      }
    } else {
      // Uncaught error — log ระดับ error แต่ไม่ expose details ไปยัง client
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
        AllExceptionsFilter.name,
      );

      body = {
        error: {
          code: "INTERNAL",
          message: "An unexpected error occurred",
          messageKey: "errors.internal",
        },
      };
    }

    response.status(status).json(body);
  }
}

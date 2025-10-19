import { ZodError } from "zod";

import { buildErrorResponse } from "./responses";

interface ValidationErrorOptions {
  requestId?: string;
  defaultMessage: string;
  code: string;
}

export function buildValidationErrorResponse(
  error: unknown,
  { requestId, defaultMessage, code }: ValidationErrorOptions
): Response {
  if (error instanceof ZodError) {
    return buildErrorResponse(
      400,
      {
        code,
        message: error.errors[0]?.message ?? defaultMessage,
      },
      requestId
    );
  }

  if (error instanceof Error) {
    return buildErrorResponse(400, { code, message: error.message }, requestId);
  }

  return buildErrorResponse(400, { code, message: defaultMessage }, requestId);
}

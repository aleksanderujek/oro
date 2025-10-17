import type { APIRoute } from "astro";

import { buildErrorResponse, buildJsonResponse, getRequestId } from "../../lib/http/responses";
import { createExpense, CreateExpenseError } from "../../lib/services/expenses/createExpense";
import { validateCreateExpenseCommand } from "../../lib/validators/expenses";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const requestId = getRequestId(request);
  const supabase = locals.supabase;
  const session = locals.session;

  if (!supabase) {
    return buildErrorResponse(
      500,
      { code: "SUPABASE_NOT_AVAILABLE", message: "Supabase client not available" },
      requestId
    );
  }

  if (!session) {
    return buildErrorResponse(401, { code: "UNAUTHORIZED", message: "Authentication required" }, requestId);
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return buildErrorResponse(400, { code: "INVALID_JSON", message: "Request body must be valid JSON" }, requestId);
  }

  let command;

  try {
    command = validateCreateExpenseCommand(payload);
  } catch (error) {
    if (error instanceof Error) {
      return buildErrorResponse(400, { code: "VALIDATION_ERROR", message: error.message }, requestId);
    }

    return buildErrorResponse(400, { code: "VALIDATION_ERROR", message: "Invalid request payload" }, requestId);
  }

  try {
    const result = await createExpense({
      supabase,
      userId: session.user.id,
      input: command,
    });

    return buildJsonResponse(result.expense, 201, requestId);
  } catch (error) {
    if (error instanceof CreateExpenseError) {
      switch (error.code) {
        case "PROFILE_NOT_FOUND":
          return buildErrorResponse(403, { code: error.code, message: error.message }, requestId);
        case "ACCOUNT_REQUIRED":
        case "CATEGORY_NOT_FOUND":
          return buildErrorResponse(400, { code: error.code, message: error.message }, requestId);
        case "PROFILE_LOOKUP_FAILED":
        case "CATEGORY_LOOKUP_FAILED":
        case "EXPENSE_INSERT_FAILED":
        default:
          return buildErrorResponse(500, { code: error.code, message: "Unable to create expense" }, requestId);
      }
    }

    return buildErrorResponse(500, { code: "UNKNOWN_ERROR", message: "Unable to create expense" }, requestId);
  }
};

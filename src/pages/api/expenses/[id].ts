import type { APIRoute } from "astro";

import { buildErrorResponse, buildJsonResponse, getRequestId } from "../../../lib/http/responses";
import { buildValidationErrorResponse } from "../../../lib/http/validation";
import { softDeleteExpense, DeleteExpenseError } from "../../../lib/services/expenses/deleteExpense";
import { getExpenseById, GetExpenseByIdError } from "../../../lib/services/expenses/getExpenseById";
import { updateExpense, UpdateExpenseError } from "../../../lib/services/expenses/updateExpense";
import { validateExpenseId, validateUpdateExpenseCommand } from "../../../lib/validators/expenses";

export const prerender = false;

export const GET: APIRoute = async ({ params, locals, request }) => {
  const requestId = getRequestId(request);
  const supabase = locals.supabase;
  const session = locals.session;

  // Check Supabase availability
  if (!supabase) {
    return buildErrorResponse(
      500,
      { code: "SUPABASE_NOT_AVAILABLE", message: "Supabase client not available" },
      requestId
    );
  }

  // Check authentication
  if (!session) {
    return buildErrorResponse(401, { code: "UNAUTHORIZED", message: "Authentication required" }, requestId);
  }

  // Extract and validate expense ID from params
  let expenseId: string;

  try {
    expenseId = validateExpenseId(params.id);
  } catch (error) {
    return buildValidationErrorResponse(error, {
      requestId,
      defaultMessage: "Invalid expense ID",
      code: "INVALID_EXPENSE_ID",
    });
  }

  // Call service
  try {
    const expense = await getExpenseById({
      supabase,
      userId: session.user.id,
      expenseId,
      requestId,
    });

    return buildJsonResponse(expense, 200, requestId);
  } catch (error) {
    // Handle service errors
    if (error instanceof GetExpenseByIdError) {
      switch (error.code) {
        case "EXPENSE_NOT_FOUND":
        case "UNAUTHORIZED_ACCESS":
          // Return 404 for both (security consideration - prevent information leakage)
          return buildErrorResponse(404, { code: "EXPENSE_NOT_FOUND", message: "Expense not found" }, requestId);

        case "EXPENSE_QUERY_FAILED":
          return buildErrorResponse(500, { code: error.code, message: "Unable to retrieve expense" }, requestId);

        default:
          return buildErrorResponse(500, { code: "UNKNOWN_ERROR", message: "Unable to retrieve expense" }, requestId);
      }
    }

    // Handle unexpected errors
    return buildErrorResponse(500, { code: "UNKNOWN_ERROR", message: "Unable to retrieve expense" }, requestId);
  }
};

export const PATCH: APIRoute = async ({ params, locals, request }) => {
  const requestId = getRequestId(request);
  const supabase = locals.supabase;
  const session = locals.session;

  // Check Supabase availability
  if (!supabase) {
    return buildErrorResponse(
      500,
      { code: "SUPABASE_NOT_AVAILABLE", message: "Supabase client not available" },
      requestId
    );
  }

  // Check authentication
  if (!session) {
    return buildErrorResponse(401, { code: "UNAUTHORIZED", message: "Authentication required" }, requestId);
  }

  // Extract and validate expense ID from params
  let expenseId: string;

  try {
    expenseId = validateExpenseId(params.id);
  } catch (error) {
    return buildValidationErrorResponse(error, {
      requestId,
      defaultMessage: "Invalid expense ID",
      code: "INVALID_EXPENSE_ID",
    });
  }

  // Parse and validate request body
  let input;

  try {
    const rawBody = await request.json();
    input = validateUpdateExpenseCommand(rawBody);
  } catch (error) {
    return buildValidationErrorResponse(error, {
      requestId,
      defaultMessage: "Invalid request body",
      code: "VALIDATION_ERROR",
    });
  }

  // Call service to update expense
  try {
    const updated = await updateExpense({
      supabase,
      userId: session.user.id,
      expenseId,
      input,
      requestId,
    });

    return buildJsonResponse(updated, 200, requestId);
  } catch (error) {
    // Handle service errors
    if (error instanceof UpdateExpenseError) {
      switch (error.code) {
        case "EXPENSE_NOT_FOUND":
          // Return 404 (security consideration - prevent information leakage)
          return buildErrorResponse(404, { code: "EXPENSE_NOT_FOUND", message: "Expense not found" }, requestId);

        case "CATEGORY_NOT_FOUND":
          return buildErrorResponse(400, { code: "CATEGORY_NOT_FOUND", message: "Category does not exist" }, requestId);

        case "EXPENSE_QUERY_FAILED":
        case "CATEGORY_LOOKUP_FAILED":
        case "EXPENSE_UPDATE_FAILED":
          return buildErrorResponse(500, { code: error.code, message: "Unable to update expense" }, requestId);

        default:
          return buildErrorResponse(500, { code: "UNKNOWN_ERROR", message: "Unable to update expense" }, requestId);
      }
    }

    // Handle unexpected errors
    return buildErrorResponse(500, { code: "UNKNOWN_ERROR", message: "Unable to update expense" }, requestId);
  }
};

export const DELETE: APIRoute = async ({ params, locals, request }) => {
  const requestId = getRequestId(request);
  const supabase = locals.supabase;
  const session = locals.session;

  // Check Supabase availability
  if (!supabase) {
    return buildErrorResponse(
      500,
      { code: "SUPABASE_NOT_AVAILABLE", message: "Supabase client not available" },
      requestId
    );
  }

  // Check authentication
  if (!session) {
    return buildErrorResponse(401, { code: "UNAUTHORIZED", message: "Authentication required" }, requestId);
  }

  // Extract and validate expense ID from params
  let expenseId: string;

  try {
    expenseId = validateExpenseId(params.id);
  } catch (error) {
    return buildValidationErrorResponse(error, {
      requestId,
      defaultMessage: "Invalid expense ID",
      code: "INVALID_EXPENSE_ID",
    });
  }

  // Call service to soft-delete expense
  try {
    const result = await softDeleteExpense({
      supabase,
      userId: session.user.id,
      expenseId,
      requestId,
    });

    return buildJsonResponse(result, 200, requestId);
  } catch (error) {
    // Handle service errors
    if (error instanceof DeleteExpenseError) {
      switch (error.code) {
        case "EXPENSE_NOT_FOUND":
        case "UNAUTHORIZED_ACCESS":
          // Return 404 for both (security consideration - prevent information leakage)
          return buildErrorResponse(404, { code: "EXPENSE_NOT_FOUND", message: "Expense not found" }, requestId);

        case "SUPABASE_NOT_AVAILABLE":
        case "EXPENSE_QUERY_FAILED":
        case "EXPENSE_DELETE_FAILED":
          return buildErrorResponse(500, { code: error.code, message: "Unable to delete expense" }, requestId);

        default:
          return buildErrorResponse(500, { code: "UNKNOWN_ERROR", message: "Unable to delete expense" }, requestId);
      }
    }

    // Handle unexpected errors
    return buildErrorResponse(500, { code: "UNKNOWN_ERROR", message: "Unable to delete expense" }, requestId);
  }
};

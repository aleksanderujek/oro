import type { Tables } from "../../../db/database.types";
import type { SupabaseClient } from "../../../db/supabase.client";
import type { RestoreExpenseResponse } from "../../../types";

/**
 * 7-day retention window in milliseconds
 */
const RETENTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type RestoreExpenseErrorCode =
  | "SUPABASE_NOT_AVAILABLE"
  | "UNAUTHORIZED_ACCESS"
  | "EXPENSE_NOT_FOUND"
  | "EXPENSE_NOT_DELETED"
  | "RETENTION_WINDOW_EXPIRED"
  | "EXPENSE_QUERY_FAILED"
  | "EXPENSE_UPDATE_FAILED";

export class RestoreExpenseError extends Error {
  public readonly code: RestoreExpenseErrorCode;

  constructor(code: RestoreExpenseErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "RestoreExpenseError";
    this.code = code;

    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}

interface RestoreExpenseParams {
  supabase: SupabaseClient;
  userId: string;
  expenseId: string;
  requestId?: string;
}

type ExpenseRowForRestore = Pick<Tables<"expenses">, "id" | "deleted_at" | "updated_at">;

/**
 * Maps database expense row after restore to RestoreExpenseResponse
 */
function toRestoreExpenseResponse(row: ExpenseRowForRestore): RestoreExpenseResponse {
  if (row.deleted_at !== null) {
    throw new Error("deleted_at must be null after restore");
  }

  return {
    id: row.id,
    deleted: false,
    restoredAt: row.updated_at,
  };
}

/**
 * Restores a soft-deleted expense by clearing the deleted_at timestamp
 *
 * Flow:
 * 1. Query expense with matching id, user_id, and deleted=true to verify ownership
 * 2. Throw EXPENSE_NOT_FOUND if no matching row
 * 3. Throw EXPENSE_NOT_DELETED if deleted_at is null (shouldn't happen with deleted=true filter)
 * 4. Check if deleted_at is within retention window (7 days), throw RETENTION_WINDOW_EXPIRED if exceeded
 * 5. Update deleted_at to null to restore the expense
 * 6. Return RestoreExpenseResponse with id, deleted=false, and restoredAt timestamp
 *
 * @throws {RestoreExpenseError} When expense not found, not deleted, retention expired, or database error occurs
 * @returns RestoreExpenseResponse with restore metadata
 */
export async function restoreExpense({
  supabase,
  userId,
  expenseId,
  requestId,
}: RestoreExpenseParams): Promise<RestoreExpenseResponse> {
  // First, verify expense exists, is deleted, and user has ownership
  const { data: existingExpense, error: queryError } = await supabase
    .from("expenses")
    .select("id, deleted_at")
    .eq("id", expenseId)
    .eq("user_id", userId)
    .eq("deleted", true)
    .maybeSingle<Pick<Tables<"expenses">, "id" | "deleted_at">>();

  // Handle query errors
  if (queryError) {
    throw new RestoreExpenseError("EXPENSE_QUERY_FAILED", "Unable to retrieve expense", {
      cause: { error: queryError, expenseId, userId, requestId },
    });
  }

  // Handle not found (includes non-deleted expenses or unauthorized access)
  if (!existingExpense) {
    throw new RestoreExpenseError("EXPENSE_NOT_FOUND", "Expense not found", {
      cause: { expenseId, userId, requestId },
    });
  }

  // Verify deleted_at is set (should always be true with deleted=true filter, but defensive check)
  if (!existingExpense.deleted_at) {
    throw new RestoreExpenseError("EXPENSE_NOT_DELETED", "Expense is not deleted", {
      cause: { expenseId, userId, requestId },
    });
  }

  // Check retention window
  const deletedTime = new Date(existingExpense.deleted_at).getTime();
  const currentTime = Date.now();
  const timeSinceDeletion = currentTime - deletedTime;

  if (timeSinceDeletion > RETENTION_WINDOW_MS) {
    throw new RestoreExpenseError("RETENTION_WINDOW_EXPIRED", "Expense cannot be restored after 7 days", {
      cause: { expenseId, userId, deletedAt: existingExpense.deleted_at, requestId },
    });
  }

  // Restore expense by clearing deleted_at timestamp
  const { data: restoredExpense, error: updateError } = await supabase
    .from("expenses")
    .update({ deleted_at: null })
    .eq("id", expenseId)
    .eq("user_id", userId)
    .select("id, deleted_at, updated_at")
    .single<ExpenseRowForRestore>();

  // Handle update errors
  if (updateError) {
    throw new RestoreExpenseError("EXPENSE_UPDATE_FAILED", "Failed to restore expense", {
      cause: { error: updateError, expenseId, userId, requestId },
    });
  }

  // Map to response DTO
  return toRestoreExpenseResponse(restoredExpense);
}

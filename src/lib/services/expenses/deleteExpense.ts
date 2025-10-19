import type { Tables } from "../../../db/database.types";
import type { SupabaseClient } from "../../../db/supabase.client";
import type { DeleteExpenseResponse } from "../../../types";

export type DeleteExpenseErrorCode =
  | "SUPABASE_NOT_AVAILABLE"
  | "UNAUTHORIZED_ACCESS"
  | "EXPENSE_NOT_FOUND"
  | "EXPENSE_QUERY_FAILED"
  | "EXPENSE_DELETE_FAILED";

export class DeleteExpenseError extends Error {
  public readonly code: DeleteExpenseErrorCode;

  constructor(code: DeleteExpenseErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "DeleteExpenseError";
    this.code = code;

    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}

interface SoftDeleteExpenseParams {
  supabase: SupabaseClient;
  userId: string;
  expenseId: string;
  requestId?: string;
}

type ExpenseRowForDelete = Pick<Tables<"expenses">, "id" | "deleted_at">;

/**
 * Maps database expense row after soft-delete to DeleteExpenseResponse
 */
function toDeleteExpenseResponse(row: ExpenseRowForDelete): DeleteExpenseResponse {
  if (!row.deleted_at) {
    throw new Error("deleted_at must be set after soft-delete");
  }

  return {
    id: row.id,
    deleted: true,
    deletedAt: row.deleted_at,
  };
}

/**
 * Soft-deletes an expense by setting deleted_at timestamp
 * 
 * Flow:
 * 1. Query expense with matching id, user_id, and deleted=false to verify ownership and prevent redundant deletes
 * 2. Throw EXPENSE_NOT_FOUND if no matching row
 * 3. Update deleted_at to current timestamp
 * 4. Return DeleteExpenseResponse with id, deleted=true, and deletedAt timestamp
 * 
 * @throws {DeleteExpenseError} When expense not found, already deleted, unauthorized, or database error occurs
 * @returns DeleteExpenseResponse with soft-delete metadata
 */
export async function softDeleteExpense({
  supabase,
  userId,
  expenseId,
  requestId,
}: SoftDeleteExpenseParams): Promise<DeleteExpenseResponse> {
  // First, verify expense exists and user has ownership
  const { data: existingExpense, error: queryError } = await supabase
    .from("expenses")
    .select("id")
    .eq("id", expenseId)
    .eq("user_id", userId)
    .eq("deleted", false)
    .maybeSingle<Pick<Tables<"expenses">, "id">>();

  // Handle query errors
  if (queryError) {
    throw new DeleteExpenseError("EXPENSE_QUERY_FAILED", "Unable to retrieve expense", {
      cause: { error: queryError, expenseId, userId, requestId },
    });
  }

  // Handle not found (includes already deleted or unauthorized access)
  if (!existingExpense) {
    throw new DeleteExpenseError("EXPENSE_NOT_FOUND", "Expense not found", {
      cause: { expenseId, userId, requestId },
    });
  }

  // Perform soft-delete by setting deleted_at timestamp
  const now = new Date().toISOString();
  const { data: deletedExpense, error: deleteError } = await supabase
    .from("expenses")
    .update({ deleted_at: now })
    .eq("id", expenseId)
    .eq("user_id", userId)
    .select("id, deleted_at")
    .single<ExpenseRowForDelete>();

  // Handle delete errors
  if (deleteError) {
    throw new DeleteExpenseError("EXPENSE_DELETE_FAILED", "Failed to delete expense", {
      cause: { error: deleteError, expenseId, userId, requestId },
    });
  }

  // Map to response DTO
  return toDeleteExpenseResponse(deletedExpense);
}


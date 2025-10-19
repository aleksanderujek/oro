import type { Tables } from "../../../db/database.types";
import type { SupabaseClient } from "../../../db/supabase.client";
import type { ExpenseDetailsResponse } from "../../../types";

export type GetExpenseByIdErrorCode = "EXPENSE_NOT_FOUND" | "EXPENSE_QUERY_FAILED" | "UNAUTHORIZED_ACCESS";

export class GetExpenseByIdError extends Error {
  public readonly code: GetExpenseByIdErrorCode;

  constructor(code: GetExpenseByIdErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "GetExpenseByIdError";
    this.code = code;
    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}

interface GetExpenseByIdParams {
  supabase: SupabaseClient;
  userId: string;
  expenseId: string;
  requestId?: string;
}

type ExpenseRow = Omit<Tables<"expenses">, "merchant_key" | "search_text" | "user_id">;

function toExpenseDTO(row: ExpenseRow): ExpenseDetailsResponse {
  return {
    id: row.id,
    amount: row.amount,
    name: row.name,
    description: row.description,
    occurredAt: row.occurred_at,
    account: row.account,
    categoryId: row.category_id,
    deleted: row.deleted,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getExpenseById({
  supabase,
  userId,
  expenseId,
  requestId,
}: GetExpenseByIdParams): Promise<ExpenseDetailsResponse> {
  // Query with authorization built-in via user_id filter
  const { data, error } = await supabase
    .from("expenses")
    .select(
      "id, amount, name, description, occurred_at, account, category_id, deleted, deleted_at, created_at, updated_at"
    )
    .eq("id", expenseId)
    .eq("user_id", userId)
    .eq("deleted", false)
    .maybeSingle<ExpenseRow>();

  // Handle database errors
  if (error) {
    throw new GetExpenseByIdError("EXPENSE_QUERY_FAILED", "Unable to retrieve expense", {
      cause: { error, expenseId, userId, requestId },
    });
  }

  // Handle not found (includes authorization failure)
  if (!data) {
    throw new GetExpenseByIdError("EXPENSE_NOT_FOUND", "Expense not found", {
      cause: { expenseId, userId, requestId },
    });
  }

  // Map to DTO
  return toExpenseDTO(data);
}

import type { Tables, TablesUpdate } from "../../../db/database.types";
import type { SupabaseClient } from "../../../db/supabase.client";
import type { ExpenseDTO, UpdateExpenseCommand } from "../../../types";

export type UpdateExpenseErrorCode =
  | "EXPENSE_NOT_FOUND"
  | "EXPENSE_QUERY_FAILED"
  | "CATEGORY_NOT_FOUND"
  | "CATEGORY_LOOKUP_FAILED"
  | "EXPENSE_UPDATE_FAILED";

export class UpdateExpenseError extends Error {
  public readonly code: UpdateExpenseErrorCode;

  constructor(code: UpdateExpenseErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "UpdateExpenseError";
    this.code = code;

    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}

interface UpdateExpenseParams {
  supabase: SupabaseClient;
  userId: string;
  expenseId: string;
  input: UpdateExpenseCommand;
  requestId?: string;
}

type ExpenseRow = Tables<"expenses">;

/**
 * Maps database expense row to ExpenseDTO
 */
function toExpenseDTO(row: ExpenseRow): ExpenseDTO {
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

/**
 * Fetches expense and verifies ownership and existence
 * Throws UpdateExpenseError if expense not found or user lacks ownership
 */
async function fetchExpenseForUpdate(
  supabase: SupabaseClient,
  userId: string,
  expenseId: string
): Promise<ExpenseRow> {
  const { data, error } = await supabase
    .from("expenses")
    .select("id")
    .eq("id", expenseId)
    .eq("user_id", userId)
    .eq("deleted", false)
    .maybeSingle<Pick<ExpenseRow, "id">>();

  if (error) {
    throw new UpdateExpenseError("EXPENSE_QUERY_FAILED", "Unable to retrieve expense", { cause: error });
  }

  if (!data) {
    throw new UpdateExpenseError("EXPENSE_NOT_FOUND", "Expense not found");
  }

  return data as ExpenseRow;
}

/**
 * Validates that the category exists in the database
 * Throws UpdateExpenseError if category not found
 */
async function ensureCategoryExists(supabase: SupabaseClient, categoryId: string): Promise<void> {
  const { data, error } = await supabase
    .from("categories")
    .select("id")
    .eq("id", categoryId)
    .maybeSingle<{ id: string }>();

  if (error) {
    throw new UpdateExpenseError("CATEGORY_LOOKUP_FAILED", "Unable to verify category", { cause: error });
  }

  if (!data) {
    throw new UpdateExpenseError("CATEGORY_NOT_FOUND", "Category does not exist");
  }
}

/**
 * Builds the database update payload from the input command
 * Handles field name mapping from camelCase to snake_case
 * Handles explicit null for description clearing
 */
function buildUpdatePayload(input: UpdateExpenseCommand): TablesUpdate<"expenses"> {
  const payload: TablesUpdate<"expenses"> = {};

  if (input.amount !== undefined) {
    payload.amount = input.amount;
  }

  if (input.name !== undefined) {
    payload.name = input.name;
  }

  if ("description" in input) {
    payload.description = input.description ?? null;
  }

  if (input.occurredAt !== undefined) {
    payload.occurred_at = input.occurredAt;
  }

  if (input.categoryId !== undefined) {
    payload.category_id = input.categoryId;
  }

  if (input.account !== undefined) {
    payload.account = input.account;
  }

  return payload;
}

/**
 * Updates an existing expense with partial update semantics
 * 
 * @throws {UpdateExpenseError} When expense not found, category invalid, or database error occurs
 * @returns Updated expense as ExpenseDTO
 */
export async function updateExpense({
  supabase,
  userId,
  expenseId,
  input,
  requestId,
}: UpdateExpenseParams): Promise<ExpenseDTO> {
  // Verify expense exists and user has ownership
  await fetchExpenseForUpdate(supabase, userId, expenseId);

  // Validate category exists if categoryId is being updated
  if (input.categoryId !== undefined) {
    await ensureCategoryExists(supabase, input.categoryId);
  }

  // Build update payload
  const payload = buildUpdatePayload(input);

  // Execute update and fetch updated row
  const { data, error } = await supabase
    .from("expenses")
    .update(payload)
    .eq("id", expenseId)
    .eq("user_id", userId)
    .select()
    .single<ExpenseRow>();

  if (error) {
    throw new UpdateExpenseError("EXPENSE_UPDATE_FAILED", "Failed to update expense", { cause: error });
  }

  // Map to DTO and return
  return toExpenseDTO(data);
}


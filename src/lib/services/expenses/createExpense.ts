import type { Tables, TablesInsert } from "../../../db/database.types";
import type { SupabaseClient } from "../../../db/supabase.client";
import type { CreateExpenseCommand, ExpenseDTO } from "../../../types";

export type CreateExpenseErrorCode =
  | "PROFILE_LOOKUP_FAILED"
  | "PROFILE_NOT_FOUND"
  | "ACCOUNT_REQUIRED"
  | "CATEGORY_LOOKUP_FAILED"
  | "CATEGORY_NOT_FOUND"
  | "EXPENSE_INSERT_FAILED";

export class CreateExpenseError extends Error {
  public readonly code: CreateExpenseErrorCode;

  constructor(code: CreateExpenseErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "CreateExpenseError";
    this.code = code;

    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}

interface CreateExpenseParams {
  supabase: SupabaseClient;
  userId: string;
  input: CreateExpenseCommand;
  requestId?: string;
}

interface CreateExpenseResult {
  expense: ExpenseDTO;
  profileAccountUpdated: boolean;
}

type ExpenseRow = Tables<"expenses">;
type ExpenseInsert = TablesInsert<"expenses">;
type ProfileRow = Tables<"profiles">;

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

async function fetchProfile(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, last_account")
    .eq("id", userId)
    .maybeSingle<Pick<ProfileRow, "id" | "last_account">>();

  if (error) {
    throw new CreateExpenseError("PROFILE_LOOKUP_FAILED", "Unable to load profile", { cause: error });
  }

  if (!data) {
    throw new CreateExpenseError("PROFILE_NOT_FOUND", "Profile not found for user");
  }

  return data;
}

async function ensureCategoryExists(supabase: SupabaseClient, categoryId: string) {
  const { data, error } = await supabase
    .from("categories")
    .select("id")
    .eq("id", categoryId)
    .maybeSingle<{ id: string }>();

  if (error) {
    throw new CreateExpenseError("CATEGORY_LOOKUP_FAILED", "Unable to verify category", { cause: error });
  }

  if (!data) {
    const { data: uncategorizedId, error: uncategorizedError } = await supabase.rpc("uncategorized_uuid");

    if (uncategorizedError) {
      throw new CreateExpenseError("CATEGORY_LOOKUP_FAILED", "Unable to resolve uncategorized category", {
        cause: uncategorizedError,
      });
    }

    if (categoryId !== uncategorizedId) {
      throw new CreateExpenseError("CATEGORY_NOT_FOUND", "Category does not exist");
    }
  }
}

function resolveAccount(
  input: CreateExpenseCommand,
  profile: Pick<ProfileRow, "last_account">
): NonNullable<ExpenseRow["account"]> {
  if (input.account) {
    return input.account;
  }

  if (profile.last_account) {
    return profile.last_account;
  }

  throw new CreateExpenseError("ACCOUNT_REQUIRED", "Account must be provided when no profile default is available");
}

async function insertExpense(supabase: SupabaseClient, userId: string, payload: Omit<ExpenseInsert, "user_id">) {
  const { data, error } = await supabase
    .from("expenses")
    .insert({
      ...payload,
      user_id: userId,
    })
    .select()
    .single<ExpenseRow>();

  if (error) {
    throw new CreateExpenseError("EXPENSE_INSERT_FAILED", "Failed to create expense", { cause: error });
  }

  return data;
}

async function updateProfileAccount(supabase: SupabaseClient, userId: string, account: ExpenseRow["account"]) {
  const { error } = await supabase.from("profiles").update({ last_account: account }).eq("id", userId);

  if (error) {
    return false;
  }

  return true;
}

export async function createExpense({ supabase, userId, input }: CreateExpenseParams): Promise<CreateExpenseResult> {
  const profile = await fetchProfile(supabase, userId);

  const account = resolveAccount(input, profile);

  await ensureCategoryExists(supabase, input.categoryId);

  const newExpense = await insertExpense(supabase, userId, {
    amount: input.amount,
    name: input.name,
    description: input.description ?? null,
    occurred_at: input.occurredAt,
    account,
    category_id: input.categoryId,
  });

  const shouldUpdateProfileAccount = !input.account && profile.last_account !== account;

  let profileAccountUpdated = false;

  if (shouldUpdateProfileAccount) {
    profileAccountUpdated = await updateProfileAccount(supabase, userId, account);
  }

  return {
    expense: toExpenseDTO(newExpense),
    profileAccountUpdated,
  };
}

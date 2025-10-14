import type { Tables, Enums } from "./db/database.types";

type ProfileRow = Tables<"profiles">;
type CategoryRow = Tables<"categories">;
type ExpenseRow = Tables<"expenses">;
type MerchantMappingRow = Tables<"merchant_mappings">;
type AiLogRow = Tables<"ai_logs">;
type AccountType = Enums<"account_type">;

type CurrencyAmount = ExpenseRow["amount"];
type CursorString = string;

/**
 * Utility helper ensuring update commands include at least one mutable field while
 * preserving optionality for individual properties.
 */
type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = Pick<T, Exclude<keyof T, Keys>> &
  {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>>;
  }[Keys];

// Profiles

export interface ProfileDTO {
  id: ProfileRow["id"];
  timezone: ProfileRow["timezone"];
  lastAccount: AccountType | null;
  createdAt: ProfileRow["created_at"];
  updatedAt: ProfileRow["updated_at"];
}

interface ProfileUpdatableFields {
  timezone?: ProfileDTO["timezone"];
  lastAccount?: ProfileDTO["lastAccount"];
}

export type UpdateProfileCommand = RequireAtLeastOne<ProfileUpdatableFields>;

// Categories

export interface CategoryDTO {
  id: CategoryRow["id"];
  key: CategoryRow["key"];
  name: CategoryRow["name"];
  sortOrder: CategoryRow["sort_order"];
}

export interface CategoriesResponse {
  items: CategoryDTO[];
}

// Expenses

export interface ExpenseDTO {
  id: ExpenseRow["id"];
  amount: ExpenseRow["amount"];
  name: ExpenseRow["name"];
  description: ExpenseRow["description"];
  occurredAt: ExpenseRow["occurred_at"];
  account: ExpenseRow["account"];
  categoryId: ExpenseRow["category_id"];
  deleted: ExpenseRow["deleted"];
  deletedAt: ExpenseRow["deleted_at"];
  createdAt: ExpenseRow["created_at"];
  updatedAt: ExpenseRow["updated_at"];
}

export interface CreateExpenseCommand {
  amount: ExpenseRow["amount"];
  name: ExpenseRow["name"];
  description?: ExpenseRow["description"];
  occurredAt: ExpenseRow["occurred_at"];
  categoryId: ExpenseRow["category_id"];
  account?: ExpenseRow["account"];
}

interface ExpenseEditableFields {
  amount?: ExpenseRow["amount"];
  name?: ExpenseRow["name"];
  description?: ExpenseRow["description"];
  occurredAt?: ExpenseRow["occurred_at"];
  categoryId?: ExpenseRow["category_id"];
  account?: ExpenseRow["account"];
}

export type UpdateExpenseCommand = RequireAtLeastOne<ExpenseEditableFields>;

export interface ExpenseListResponse {
  items: ExpenseDTO[];
  nextCursor: CursorString | null;
  hasMore: boolean;
}

export type ExpenseDetailsResponse = ExpenseDTO;

export interface DeleteExpenseResponse {
  id: ExpenseRow["id"];
  deleted: true;
  deletedAt: NonNullable<ExpenseRow["deleted_at"]>;
}

export interface RestoreExpenseResponse {
  id: ExpenseRow["id"];
  deleted: false;
  restoredAt: ExpenseRow["updated_at"];
}

// Merchant mappings

export interface MerchantMappingDTO {
  id: MerchantMappingRow["id"];
  merchantKey: MerchantMappingRow["merchant_key"];
  categoryId: MerchantMappingRow["category_id"];
  updatedAt: MerchantMappingRow["updated_at"];
}

export interface MerchantMappingListResponse {
  items: MerchantMappingDTO[];
  nextCursor: CursorString | null;
  hasMore: boolean;
}

export interface UpsertMerchantMappingCommand {
  merchantName: string;
  categoryId: MerchantMappingRow["category_id"];
}

export interface UpdateMerchantMappingCommand {
  categoryId: MerchantMappingRow["category_id"];
}

export type MerchantMappingMatchType = "exact" | "trigram";

export interface ResolveMerchantMappingMatchDTO {
  categoryId: MerchantMappingRow["category_id"];
  confidence: number;
  matchType: MerchantMappingMatchType;
  merchantKey: MerchantMappingRow["merchant_key"];
}

export interface ResolveMerchantMappingResponse {
  match: ResolveMerchantMappingMatchDTO | null;
}

export interface DeleteMerchantMappingResponse {
  id: MerchantMappingRow["id"];
  deleted: true;
}

// AI categorization

export interface CategorizeExpenseCommand {
  amount: ExpenseRow["amount"];
  name: ExpenseRow["name"];
  description?: ExpenseRow["description"];
  occurredAt: ExpenseRow["occurred_at"];
  account?: ExpenseRow["account"];
}

export interface CategorizeExpenseSuggestionDTO {
  categoryId: CategoryRow["id"];
  confidence: number;
}

export interface CategorizeExpenseResponse {
  autoAppliedCategoryId?: CategoryRow["id"];
  confidence: number;
  suggestions: CategorizeExpenseSuggestionDTO[];
  timedOut: AiLogRow["timed_out"];
  latencyMs: AiLogRow["latency_ms"];
  provider: AiLogRow["provider"];
}

// Dashboard

export interface DashboardDailyTotalDTO {
  date: string;
  total: CurrencyAmount;
}

export interface DashboardTopCategoryDTO {
  categoryId: CategoryRow["id"];
  name: CategoryRow["name"];
  total: CurrencyAmount;
  percentage: number;
}

export interface DashboardResponse {
  month: string;
  timezone: ProfileRow["timezone"];
  total: CurrencyAmount;
  monthOverMonth: {
    absolute: CurrencyAmount;
    percent: number;
  };
  daily: DashboardDailyTotalDTO[];
  topCategories: DashboardTopCategoryDTO[];
}

// Authentication

export interface SendMagicLinkCommand {
  email: string;
  redirectUrl: string;
}

export interface SendMagicLinkResponse {
  status: "sent";
}

export interface SignOutResponse {
  status: "signed_out";
}

import { endOfDay, endOfMonth, startOfDay, startOfMonth, subDays, subMonths } from "date-fns";

import type { Tables } from "../../../db/database.types";
import type { SupabaseClient } from "../../../db/supabase.client";
import type { ExpenseDTO, ExpenseListResponse } from "../../../types";
import type { ExpenseListFilters, ExpenseTimeRange } from "../../validators/expenses";
import { encodeExpenseCursor } from "../../validators/expenses";
import type { PostgrestError } from "@supabase/supabase-js";
import type { PostgrestFilterBuilder, PostgrestResponse } from "@supabase/postgrest-js";

export type GetExpensesErrorCode =
  | "PROFILE_LOOKUP_FAILED"
  | "PROFILE_NOT_FOUND"
  | "EXPENSES_QUERY_FAILED"
  | "INVALID_CURSOR"
  | "TIMEZONE_LOOKUP_FAILED";

export class GetExpensesError extends Error {
  public readonly code: GetExpensesErrorCode;

  constructor(code: GetExpensesErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "GetExpensesError";
    this.code = code;

    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}

interface GetExpensesParams {
  supabase: SupabaseClient;
  userId: string;
  filters: ExpenseListFilters;
  requestId?: string;
}

type ExpenseRow = Omit<Tables<"expenses">, "merchant_key" | "search_text" | "user_id">
type ProfileRow = Tables<"profiles">;

interface DateRange {
  from?: string;
  to?: string;
}

interface CreateExpensesQueryParams {
  supabase: SupabaseClient;
  userId: string;
  limit: number;
  filters: ExpenseListFilters;
  dateRange: DateRange;
}

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

async function fetchUserTimezone(
  supabase: SupabaseClient,
  userId: string,
  requestId?: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .maybeSingle<Pick<ProfileRow, "timezone">>();

  if (error) {
    throw new GetExpensesError("TIMEZONE_LOOKUP_FAILED", "Unable to load user timezone", {
      cause: { error, userId, requestId },
    });
  }

  return data?.timezone ?? null;
}

function resolveDateRange(filters: ExpenseListFilters, timezone: string | null): DateRange {
  if (filters.from && filters.to) {
    return { from: filters.from, to: filters.to };
  }

  if (!filters.timeRange) {
    return {};
  }

  const referenceDate = resolveReferenceDate(timezone);

  const rangeMap: Record<ExpenseTimeRange, () => DateRange> = {
    this_month: () => {
      const start = startOfMonth(referenceDate);
      const end = endOfMonth(referenceDate);

      return {
        from: start.toISOString(),
        to: end.toISOString(),
      };
    },
    last_7_days: () => {
      const rangeEnd = endOfDay(referenceDate);
      const rangeStart = startOfDay(subDays(rangeEnd, 6));

      return {
        from: rangeStart.toISOString(),
        to: rangeEnd.toISOString(),
      };
    },
    last_month: () => {
      const startCurrentMonth = startOfMonth(referenceDate);
      const lastMonthStart = startOfMonth(subMonths(startCurrentMonth, 1));
      const lastMonthEnd = endOfMonth(subMonths(startCurrentMonth, 1));

      return {
        from: lastMonthStart.toISOString(),
        to: lastMonthEnd.toISOString(),
      };
    },
  };

  return rangeMap[filters.timeRange]!();
}

function computeNextCursor(rows: ExpenseRow[], limit: number): string | null {
  if (rows.length <= limit) {
    return null;
  }

  const next = rows[limit];

  return encodeExpenseCursor({
    occurredAt: next.occurred_at,
    id: next.id,
  });
}

function createExpensesQuery({
  supabase,
  userId,
  limit,
  filters,
  dateRange,
}: CreateExpensesQueryParams) {
  const baseQuery = supabase
    .from("expenses")
    .select(
      "id, amount, name, description, occurred_at, account, category_id, deleted, deleted_at, created_at, updated_at"
    )
    .eq("user_id", userId)
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (!filters.includeDeleted) {
    baseQuery.eq("deleted", false);
  }

  if (dateRange.from) {
    baseQuery.gte("occurred_at", dateRange.from);
  }

  if (dateRange.to) {
    baseQuery.lte("occurred_at", dateRange.to);
  }

  if (filters.categoryIds?.length) {
    baseQuery.in("category_id", filters.categoryIds);
  }

  if (filters.account) {
    baseQuery.eq("account", filters.account);
  }

  if (filters.cursor) {
    const { occurredAt, id } = filters.cursor;
    baseQuery.or(buildCursorClause(occurredAt, id));
  }

  return baseQuery;
}

function isTrigramUnavailable(error: PostgrestError): boolean {
  if (!error) {
    return false;
  }

  if (error.code === "42704" && error.message?.includes("similarity")) {
    return true;
  }

  return Boolean(error.message && error.message.includes("pg_trgm"));
}

export async function getExpenses({
  supabase,
  userId,
  filters,
  requestId,
}: GetExpensesParams): Promise<ExpenseListResponse> {
  const timezone = await fetchUserTimezone(supabase, userId, requestId);

  const dateRange = resolveDateRange(filters, timezone);

  const baseQuery = createExpensesQuery({
    supabase,
    userId,
    limit: filters.limit,
    filters,
    dateRange,
  });

  if (filters.search) {
    baseQuery.textSearch("search_text", sanitizeTsQuery(filters.search), {
      type: "plain",
      config: "english",
    });
  }

  let result = await baseQuery;

  if (filters.search && result.error && isTrigramUnavailable(result.error)) {
    const fallbackQuery = createExpensesQuery({
      supabase,
      userId,
      limit: filters.limit,
      filters,
      dateRange,
    });

    fallbackQuery.ilike("search_text", `%${escapeForLike(filters.search)}%`);
    result = await fallbackQuery;
  }

  const { data, error }: PostgrestResponse<ExpenseRow> = result;

  if (error) {
    throw new GetExpensesError("EXPENSES_QUERY_FAILED", "Unable to load expenses", {
      cause: { error, userId, filters, requestId },
    });
  }

  const hasMore = data.length > filters.limit;
  const items = data.slice(0, filters.limit).map(toExpenseDTO);
  const nextCursor = computeNextCursor(data, filters.limit);

  return {
    items,
    nextCursor,
    hasMore,
  };
}

function resolveReferenceDate(timezone: string | null): Date {
  if (!timezone) {
    return new Date();
  }

  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    const formatted = formatter.format(new Date());
    const [datePart, timePart] = formatted.split(", ");

    if (!datePart || !timePart) {
      return new Date();
    }

    const [month, day, year] = datePart.split("/").map(Number);
    const [hour, minute, second] = timePart.split(":").map(Number);

    if ([month, day, year, hour, minute, second].some((value) => Number.isNaN(value))) {
      return new Date();
    }

    return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  } catch {
    return new Date();
  }
}

function buildCursorClause(occurredAt: string, id: string): string {
  const safeOccurredAt = escapeCursorValue(occurredAt);
  const safeId = escapeCursorValue(id);

  return `occurred_at.lt.${safeOccurredAt},and(occurred_at.eq.${safeOccurredAt},id.lt.${safeId})`;
}

function escapeCursorValue(value: string): string {
  return value.replace(/,/g, "\\,");
}

function sanitizeTsQuery(term: string): string {
  return term.replace(/'/g, "''");
}

function escapeForLike(term: string): string {
  return term.replace(/[%_]/g, "\\$&");
}


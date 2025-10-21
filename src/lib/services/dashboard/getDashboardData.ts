import { endOfMonth, format, set, setHours, startOfMonth, subMonths } from "date-fns";

import type { Tables } from "../../../db/database.types";
import type { SupabaseClient } from "../../../db/supabase.client";
import type { AccountType, DashboardResponse } from "../../../types";

export type GetDashboardDataErrorCode =
  | "PROFILE_LOOKUP_FAILED"
  | "PROFILE_NOT_FOUND"
  | "DASHBOARD_METRICS_FAILED"
  | "INVALID_MONTH_FORMAT";

export class GetDashboardDataError extends Error {
  public readonly code: GetDashboardDataErrorCode;

  constructor(code: GetDashboardDataErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "GetDashboardDataError";
    this.code = code;

    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}

export interface GetDashboardDataOptions {
  month?: string;
  timezone: string;
  account?: AccountType | "all";
  categoryIds?: string[];
}

interface GetDashboardDataParams {
  supabase: SupabaseClient;
  userId: string;
  options: GetDashboardDataOptions;
  requestId?: string;
}

type ProfileRow = Tables<"profiles">;

interface DashboardMetricsResult {
  currentTotal: number;
  previousTotal: number;
  daily: Array<{
    date: string;
    total: number;
  }>;
  topCategories: Array<{
    categoryId: string;
    name: string;
    total: number;
  }>;
}

/**
 * Resolves the target month from user input or defaults to current month in user's timezone.
 * Returns the month in YYYY-MM format.
 */
function resolveTargetMonth(month: string | undefined, timezone: string): string {
  if (month) {
    return month;
  }

  // Get current date in user's timezone
  const referenceDate = resolveReferenceDateInTimezone(timezone);
  return format(referenceDate, "yyyy-MM");
}

/**
 * Resolves a reference date in the user's timezone.
 * Returns a Date object representing "now" in the user's timezone.
 */
function resolveReferenceDateInTimezone(timezone: string): Date {
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

    return set(new Date(), {
      year,
      month: month - 1,
      date: day,
      hours: hour,
      minutes: minute,
      seconds: second,
      milliseconds: 0,
    });
  } catch {
    return new Date();
  }
}

/**
 * Calculates the start and end timestamps for a given month in a specific timezone.
 * Returns ISO timestamps that represent the full month in the user's timezone.
 */
function getMonthBoundaries(yearMonth: string, timezone: string): { start: string; end: string } {
  const [year, month] = yearMonth.split("-").map(Number);

  if (!year || !month || month < 1 || month > 12) {
    throw new GetDashboardDataError("INVALID_MONTH_FORMAT", "Invalid month format");
  }

  try {
    // Create a reference date for the first day of the target month at noon (to avoid DST edge cases)
    const monthDate = set(new Date(), { year, month: month - 1, date: 1 });
    const referenceDate = setHours(monthDate, 12);

    // Format this date in the user's timezone to get the local representation
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

    const parts = formatter.formatToParts(referenceDate);
    const tzYear = parseInt(parts.find((p) => p.type === "year")?.value || "0");
    const tzMonth = parseInt(parts.find((p) => p.type === "month")?.value || "0");
    const tzDay = parseInt(parts.find((p) => p.type === "day")?.value || "0");
    const tzHour = parseInt(parts.find((p) => p.type === "hour")?.value || "0");
    const tzMinute = parseInt(parts.find((p) => p.type === "minute")?.value || "0");
    const tzSecond = parseInt(parts.find((p) => p.type === "second")?.value || "0");

    // Calculate the offset between UTC and the user's timezone
    const tzDate = set(new Date(), {
      year: tzYear,
      month: tzMonth - 1,
      date: tzDay,
      hours: tzHour,
      minutes: tzMinute,
      seconds: tzSecond,
      milliseconds: 0,
    });
    const offset = referenceDate.getTime() - tzDate.getTime();

    // Use date-fns to get the start and end of the month in local time
    const localMonthStart = startOfMonth(monthDate);
    const localMonthEnd = endOfMonth(monthDate);

    // Apply the timezone offset to convert to UTC
    const startUTC = new Date(localMonthStart.getTime() + offset);
    const endUTC = new Date(localMonthEnd.getTime() + offset);

    return {
      start: startUTC.toISOString(),
      end: endUTC.toISOString(),
    };
  } catch (error) {
    throw new GetDashboardDataError("INVALID_MONTH_FORMAT", "Failed to parse month boundaries", {
      cause: { error, yearMonth, timezone },
    });
  }
}

/**
 * Calculates the previous month in YYYY-MM format.
 */
function getPreviousMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number);

  if (!year || !month) {
    throw new GetDashboardDataError("INVALID_MONTH_FORMAT", "Invalid month format");
  }

  const date = set(new Date(), { year, month: month - 1, date: 1 });
  const prevMonthDate = subMonths(date, 1);

  return format(prevMonthDate, "yyyy-MM");
}

/**
 * Fetches the user's timezone from their profile.
 */
async function fetchUserTimezone(supabase: SupabaseClient, userId: string, requestId?: string): Promise<string> {
  const { data, error } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .maybeSingle<Pick<ProfileRow, "timezone">>();

  if (error) {
    throw new GetDashboardDataError("PROFILE_LOOKUP_FAILED", "Unable to load user timezone", {
      cause: { error, userId, requestId },
    });
  }

  if (!data) {
    throw new GetDashboardDataError("PROFILE_NOT_FOUND", "Profile not found for user");
  }

  // Default to UTC if no timezone is set
  return data.timezone || "UTC";
}

/**
 * Calculates month-over-month percentage change.
 * Returns 0 if previous total is 0 to avoid division by zero.
 */
function calculateMoMPercent(current: number, previous: number): number {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }

  return ((current - previous) / previous) * 100;
}

/**
 * Calculates percentage for each category relative to the total.
 */
function calculateCategoryPercentages(
  categories: DashboardMetricsResult["topCategories"],
  total: number
) {
  return categories.map((cat) => ({
    categoryId: cat.categoryId,
    name: cat.name,
    total: cat.total,
    percentage: total > 0 ? (cat.total / total) * 100 : 0,
  }));
}

export async function getDashboardData({
  supabase,
  userId,
  options,
  requestId,
}: GetDashboardDataParams): Promise<DashboardResponse> {
  // Fetch user timezone if not provided in options
  const timezone = options.timezone || (await fetchUserTimezone(supabase, userId, requestId));

  // Resolve target month (default to current month in user's timezone)
  const targetMonth = resolveTargetMonth(options.month, timezone);
  const previousMonth = getPreviousMonth(targetMonth);

  // Calculate date boundaries for current and previous month
  const currentBoundaries = getMonthBoundaries(targetMonth, timezone);
  const previousBoundaries = getMonthBoundaries(previousMonth, timezone);

  // Prepare account filter (null means all, "all" also means all)
  const accountFilter = !options.account || options.account === "all" ? null : options.account;

  // Call the Supabase RPC function
  const { data, error } = await supabase
    .rpc("get_dashboard_metrics", {
      p_user_id: userId,
      p_start_date: currentBoundaries.start,
      p_end_date: currentBoundaries.end,
      p_prev_start_date: previousBoundaries.start,
      p_prev_end_date: previousBoundaries.end,
      p_account: accountFilter,
      p_category_ids: options.categoryIds || null,
    })
    .single<DashboardMetricsResult>();

  if (error) {
    throw new GetDashboardDataError("DASHBOARD_METRICS_FAILED", "Unable to load dashboard metrics", {
      cause: { error, userId, options, requestId },
    });
  }

  if (!data) {
    throw new GetDashboardDataError("DASHBOARD_METRICS_FAILED", "No data returned from dashboard metrics");
  }

  // Calculate month-over-month metrics
  const absolute = data.currentTotal - data.previousTotal;
  const percent = calculateMoMPercent(data.currentTotal, data.previousTotal);

  // Calculate category percentages
  const topCategories = calculateCategoryPercentages(data.topCategories, data.currentTotal);

  return {
    month: targetMonth,
    timezone,
    total: data.currentTotal,
    monthOverMonth: {
      absolute,
      percent,
    },
    daily: data.daily,
    topCategories,
  };
}


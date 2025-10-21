import { z } from "zod";

import type { AccountType } from "../../types";

const ACCOUNT_TYPES = ["cash", "card", "all"] as const;

// Month format: YYYY-MM
const monthSchema = z
  .string({ invalid_type_error: "month must be a string" })
  .trim()
  .regex(/^\d{4}-\d{2}$/, "month must be in YYYY-MM format")
  .refine(
    (value) => {
      const [year, month] = value.split("-").map(Number);
      if (year < 1900 || year > 2100) return false;
      if (month < 1 || month > 12) return false;
      return true;
    },
    { message: "month must be a valid date in YYYY-MM format" }
  )
  .optional();

const accountSchema = z.enum(ACCOUNT_TYPES).optional();

const categoryIdsSchema = z
  .union([
    z.array(z.string().uuid()),
    z
      .string({ invalid_type_error: "categoryIds must be a comma-separated list" })
      .trim()
      .transform((value) => (value === "" ? [] : value.split(","))),
  ])
  .transform((value) => {
    const list = Array.isArray(value) ? value : [];

    const normalized = list.map((item) => item.trim()).filter((item) => item.length > 0);

    const unique = Array.from(new Set(normalized));

    unique.forEach((item) => {
      if (!z.string().uuid().safeParse(item).success) {
        throw new z.ZodError([
          {
            code: z.ZodIssueCode.custom,
            message: "categoryIds must contain valid UUIDs",
            path: [],
          },
        ]);
      }
    });

    if (unique.length > 50) {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          message: "categoryIds cannot contain more than 50 values",
          path: [],
        },
      ]);
    }

    return unique;
  })
  .transform((value) => (value.length === 0 ? undefined : value));

const dashboardQuerySchema = z
  .object({
    month: monthSchema,
    account: accountSchema,
    categoryIds: categoryIdsSchema.optional(),
  })
  .partial();

export interface DashboardQueryParams {
  month?: string;
  account?: AccountType | "all";
  categoryIds?: string[];
}

export function normalizeDashboardQuery(params: URLSearchParams | Record<string, unknown>): DashboardQueryParams {
  const input: Record<string, unknown> = params instanceof URLSearchParams ? Object.fromEntries(params) : params;

  const parsed = dashboardQuerySchema.parse({
    month: input.month,
    account: input.account,
    categoryIds: input.categoryIds,
  });

  return {
    month: parsed.month,
    account: parsed.account as AccountType | "all" | undefined,
    categoryIds: parsed.categoryIds,
  };
}


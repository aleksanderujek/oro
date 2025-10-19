import { z } from "zod";

import type { AccountType } from "../../types";

const ACCOUNT_TYPES: readonly AccountType[] = ["cash", "card"];
const TIME_RANGE_VALUES = ["this_month", "last_7_days", "last_month"] as const;

export type ExpenseTimeRange = (typeof TIME_RANGE_VALUES)[number];

export interface ExpenseCursor {
  occurredAt: string;
  id: string;
}

export interface ExpenseListFilters {
  timeRange?: ExpenseTimeRange;
  from?: string;
  to?: string;
  categoryIds?: string[];
  account?: AccountType;
  search?: string;
  includeDeleted: boolean;
  cursor?: ExpenseCursor;
  limit: number;
}

const isoTimestampSchema = z
  .string({ invalid_type_error: "timestamp must be an ISO string" })
  .trim()
  .superRefine((value, ctx) => {
    if (!value) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "timestamp cannot be blank",
      });
      return;
    }

    if (!value.endsWith("Z")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "timestamp must be a UTC ISO string ending with Z",
      });
      return;
    }

    if (Number.isNaN(Date.parse(value))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "timestamp must be a valid ISO string",
      });
    }
  });

const cursorSegmentSchema = z.string().trim().min(1, "cursor segments must not be empty");

const cursorStringSchema = z
  .string({ invalid_type_error: "cursor must be a string" })
  .trim()
  .refine((value) => value.length > 0, { message: "cursor cannot be blank" })
  .superRefine((value, ctx) => {
    const segments = value.split("|");

    if (segments.length !== 2) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "cursor must contain two segments" });
      return;
    }

    const [rawOccurredAt, rawId] = segments;

    const occurredResult = cursorSegmentSchema.safeParse(rawOccurredAt);
    if (!occurredResult.success) {
      occurredResult.error.issues.forEach((issue) => ctx.addIssue(issue));
    } else if (Number.isNaN(Date.parse(occurredResult.data))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "cursor occurredAt must be a valid ISO string" });
    }

    const idResult = cursorSegmentSchema.safeParse(rawId);
    if (!idResult.success) {
      idResult.error.issues.forEach((issue) => ctx.addIssue(issue));
      return;
    }

    if (!z.string().uuid().safeParse(idResult.data).success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "cursor id must be a UUID" });
    }
  });

const booleanStringSchema = z.union([z.boolean(), z.string()]).transform((value) => {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false" || normalized === "") {
    return false;
  }

  throw new z.ZodError([
    {
      code: z.ZodIssueCode.custom,
      message: "boolean value must be 'true' or 'false'",
      path: [],
    },
  ]);
});

const limitSchema = z
  .union([
    z.number({ invalid_type_error: "limit must be a number" }),
    z.string({ invalid_type_error: "limit must be a number" }).trim(),
  ])
  .transform((value) => {
    if (typeof value === "number") {
      return value;
    }

    if (value === "") {
      return undefined;
    }

    const parsed = Number(value);

    if (Number.isNaN(parsed)) {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          message: "limit must be a number",
          path: [],
        },
      ]);
    }

    return parsed;
  })
  .transform((value) => {
    if (value === undefined) {
      return 50;
    }

    if (!Number.isInteger(value)) {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          message: "limit must be an integer",
          path: [],
        },
      ]);
    }

    if (value < 1 || value > 50) {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          message: "limit must be between 1 and 50",
          path: [],
        },
      ]);
    }

    return value;
  });

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

    if (unique.length > 20) {
      throw new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          message: "categoryIds cannot contain more than 20 values",
          path: [],
        },
      ]);
    }

    return unique;
  })
  .transform((value) => (value.length === 0 ? undefined : value));

const searchSchema = z
  .string({ invalid_type_error: "search must be a string" })
  .transform((value) => value.trim())
  .refine((value) => value.length <= 200, {
    message: "search must be at most 200 characters",
  })
  .transform((value) => (value.length === 0 ? undefined : value));

const timeRangeSchema = z.enum(TIME_RANGE_VALUES).optional();

const filtersSchema = z
  .object({
    timeRange: timeRangeSchema,
    from: isoTimestampSchema.optional(),
    to: isoTimestampSchema.optional(),
    categoryIds: categoryIdsSchema.optional(),
    account: z.enum(ACCOUNT_TYPES).optional(),
    search: searchSchema.optional(),
    includeDeleted: booleanStringSchema.optional(),
    cursor: cursorStringSchema.optional(),
    limit: limitSchema.optional(),
  })
  .partial()
  .superRefine((value, ctx) => {
    if ((value.from && !value.to) || (!value.from && value.to)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "from and to must be provided together" });
    }

    if (value.from && value.to) {
      const fromTime = Date.parse(value.from);
      const toTime = Date.parse(value.to);

      if (fromTime > toTime) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "from must be earlier than or equal to to" });
      }
    }

    if (value.timeRange && value.from && value.to) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "timeRange cannot be combined with from/to" });
    }
  });

export function encodeExpenseCursor(cursor: ExpenseCursor): string {
  return `${cursor.occurredAt}|${cursor.id}`;
}

export function decodeExpenseCursor(input: string): ExpenseCursor {
  const parsed = cursorStringSchema.parse(input);
  const [occurredAt, id] = parsed.split("|");

  return { occurredAt, id };
}

export function normalizeExpenseFilters(params: URLSearchParams | Record<string, unknown>): ExpenseListFilters {
  const input: Record<string, unknown> = params instanceof URLSearchParams ? Object.fromEntries(params) : params;

  const parsed = filtersSchema.parse({
    timeRange: input.timeRange,
    from: input.from,
    to: input.to,
    categoryIds: input.categoryIds,
    account: input.account,
    search: input.search,
    includeDeleted: input.includeDeleted,
    cursor: input.cursor,
    limit: input.limit,
  });

  return {
    timeRange: parsed.timeRange,
    from: parsed.from,
    to: parsed.to,
    categoryIds: parsed.categoryIds,
    account: parsed.account,
    search: parsed.search,
    includeDeleted: parsed.includeDeleted ?? false,
    cursor: parsed.cursor ? decodeExpenseCursor(parsed.cursor) : undefined,
    limit: parsed.limit ?? 50,
  };
}

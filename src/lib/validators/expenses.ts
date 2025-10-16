import { z } from "zod";

import type { CreateExpenseCommand } from "../../types";
import { squeezeWhitespace } from "../utils";

const ACCOUNT_TYPES = ["cash", "card"] as const;

export const CreateExpenseSchema: z.ZodType<CreateExpenseCommand> = z
  .object({
    amount: z
      .number({ invalid_type_error: "amount must be a number" })
      .finite("amount must be a finite number")
      .gt(0, "amount must be greater than zero")
      .refine((value) => Number.isInteger(value * 100), {
        message: "amount must have at most two decimal places",
      }),
    name: z
      .string({ required_error: "name is required" })
      .max(64, "name must be at most 64 characters")
      .transform((value) => squeezeWhitespace(value))
      .refine((value) => value.length > 0, {
        message: "name cannot be blank",
      }),
    description: z
      .string()
      .max(200, "description must be at most 200 characters")
      .transform((value) => squeezeWhitespace(value))
      .refine((value) => value.length > 0, {
        message: "description cannot be blank",
      })
      .optional()
      .nullable()
      .transform((value) => (value === null || value === undefined ? undefined : value)),
    occurredAt: z
      .string({ invalid_type_error: "occurredAt must be an ISO string" })
      .transform((value) => value.trim())
      .refine((value) => value.endsWith("Z"), {
        message: "occurredAt must be an ISO UTC string ending with Z",
      })
      .refine((value) => !Number.isNaN(Date.parse(value)), {
        message: "occurredAt must be a valid ISO timestamp",
      }),
    categoryId: z.string({ required_error: "categoryId is required" }).uuid("categoryId must be a valid UUID"),
    account: z.enum(ACCOUNT_TYPES).optional(),
  })
  .strict();

export type CreateExpenseInput = z.infer<typeof CreateExpenseSchema>;

export function validateCreateExpenseCommand(input: unknown): CreateExpenseCommand {
  const parsed = CreateExpenseSchema.safeParse(input);

  if (!parsed.success) {
    throw parsed.error;
  }

  return parsed.data;
}

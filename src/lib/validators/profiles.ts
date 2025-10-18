import { z } from "zod";

import type { UpdateProfileCommand } from "../../types";

const ACCOUNT_TYPES = ["cash", "card"] as const;

export const UpdateProfileSchema = z
  .object({
    timezone: z
      .string({ invalid_type_error: "timezone must be a string" })
      .trim()
      .min(1, "timezone cannot be blank")
      .optional(),
    lastAccount: z.enum(ACCOUNT_TYPES).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.timezone === undefined && value.lastAccount === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one field must be provided",
      });
    }
  });

export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

export function validateUpdateProfileCommand(input: unknown): UpdateProfileCommand {
  const parsed = UpdateProfileSchema.safeParse(input);

  if (!parsed.success) {
    throw parsed.error;
  }

  return parsed.data as UpdateProfileCommand;
}

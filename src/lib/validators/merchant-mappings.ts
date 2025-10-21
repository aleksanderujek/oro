import { z } from "zod";

export const MerchantMappingIdSchema = z
  .string({
    required_error: "merchant mapping ID is required",
    invalid_type_error: "merchant mapping ID must be a string",
  })
  .uuid("merchant mapping ID must be a valid UUID");

export function validateMerchantMappingId(input: unknown): string {
  return MerchantMappingIdSchema.parse(input);
}

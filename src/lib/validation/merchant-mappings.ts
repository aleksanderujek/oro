import { z } from "zod";

/**
 * Validation schema for GET /api/merchant-mappings query parameters.
 *
 * Supports:
 * - search: optional string for filtering by merchant_key using trigram matching
 * - limit: optional number for pagination (default: 20, max: 100)
 * - cursor: optional string for keyset pagination (format: "merchant_key|id")
 */
export const GetMerchantMappingsQuerySchema = z.object({
  search: z.string().min(1).optional(),
  limit: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(100))
    .optional()
    .default("20"),
  cursor: z.string().optional(),
});

export type GetMerchantMappingsQuery = z.infer<typeof GetMerchantMappingsQuerySchema>;

/**
 * Validation schema for GET /api/merchant-mappings/resolve query parameters.
 *
 * Requires:
 * - name: non-empty string representing the raw merchant name to resolve
 */
export const ResolveMerchantMappingQuerySchema = z.object({
  name: z.string().min(1, "Merchant name cannot be empty"),
});

export type ResolveMerchantMappingQuery = z.infer<typeof ResolveMerchantMappingQuerySchema>;

/**
 * Validation schema for POST /api/merchant-mappings request body.
 *
 * Requires:
 * - merchantName: non-empty string representing the raw merchant name
 * - categoryId: valid UUID string for the category to map to
 */
export const UpsertMerchantMappingCommandSchema = z.object({
  merchantName: z.string().min(1, "Merchant name cannot be empty"),
  categoryId: z.string().uuid("Category ID must be a valid UUID"),
});

export type UpsertMerchantMappingCommand = z.infer<typeof UpsertMerchantMappingCommandSchema>;

/**
 * Validation schema for PATCH /api/merchant-mappings/{id} request body.
 *
 * Requires:
 * - categoryId: valid UUID string for the category to map to
 */
export const UpdateMerchantMappingCommandSchema = z.object({
  categoryId: z.string().uuid("Category ID must be a valid UUID"),
});

export type UpdateMerchantMappingCommand = z.infer<typeof UpdateMerchantMappingCommandSchema>;

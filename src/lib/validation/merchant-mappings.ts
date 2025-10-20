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


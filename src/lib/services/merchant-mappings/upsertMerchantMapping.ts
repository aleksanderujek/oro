import type { Tables, TablesInsert } from "../../../db/database.types";
import type { SupabaseClient } from "../../../db/supabase.client";
import type { MerchantMappingDTO, UpsertMerchantMappingCommand } from "../../../types";

export type UpsertMerchantMappingErrorCode =
  | "CATEGORY_NOT_FOUND"
  | "CATEGORY_LOOKUP_FAILED"
  | "MERCHANT_MAPPING_UPSERT_FAILED";

export class UpsertMerchantMappingError extends Error {
  public readonly code: UpsertMerchantMappingErrorCode;

  constructor(code: UpsertMerchantMappingErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "UpsertMerchantMappingError";
    this.code = code;

    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}

interface UpsertMerchantMappingParams {
  supabase: SupabaseClient;
  userId: string;
  input: UpsertMerchantMappingCommand;
  requestId?: string;
}

interface UpsertMerchantMappingResult {
  merchantMapping: MerchantMappingDTO;
  wasCreated: boolean;
}

type MerchantMappingRow = Tables<"merchant_mappings">;
type MerchantMappingInsert = TablesInsert<"merchant_mappings">;

/**
 * Normalizes a merchant name by converting to lowercase and removing all non-alphanumeric characters.
 *
 * Examples:
 * - "The Coffee Shop" -> "coffeeshop"
 * - "McDonald's Restaurant" -> "mcdonaldsrestaurant"
 * - "H&M Store" -> "hmstore"
 *
 * @param name - The raw merchant name to normalize
 * @returns The normalized merchant key
 */
function normalizeMerchantName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Maps a merchant mapping database row to a DTO.
 *
 * @param row - The database row
 * @returns The DTO representation
 */
function toMerchantMappingDTO(row: MerchantMappingRow): MerchantMappingDTO {
  return {
    id: row.id,
    merchantKey: row.merchant_key,
    categoryId: row.category_id,
    updatedAt: row.updated_at,
  };
}

/**
 * Ensures the specified category exists in the database.
 * Throws an error if the category is not found.
 *
 * @param supabase - The Supabase client
 * @param categoryId - The category ID to validate
 * @throws UpsertMerchantMappingError if category lookup fails or category doesn't exist
 */
async function ensureCategoryExists(supabase: SupabaseClient, categoryId: string): Promise<void> {
  const { data, error } = await supabase
    .from("categories")
    .select("id")
    .eq("id", categoryId)
    .maybeSingle<{ id: string }>();

  if (error) {
    throw new UpsertMerchantMappingError("CATEGORY_LOOKUP_FAILED", "Unable to verify category", { cause: error });
  }

  if (!data) {
    throw new UpsertMerchantMappingError("CATEGORY_NOT_FOUND", "Category does not exist");
  }
}

/**
 * Creates or updates a merchant mapping using the upsert operation.
 *
 * This function normalizes the merchant name to generate a merchant key, then performs
 * an atomic INSERT ... ON CONFLICT (user_id, merchant_key) DO UPDATE operation.
 * If a mapping for the same user and merchant key already exists, its category_id is updated.
 * Otherwise, a new mapping is created.
 *
 * @param params - The parameters for the upsert operation
 * @returns A promise that resolves to the created or updated merchant mapping and a flag indicating if it was newly created
 * @throws UpsertMerchantMappingError if the operation fails
 */
export async function upsertMerchantMapping({
  supabase,
  userId,
  input,
  requestId,
}: UpsertMerchantMappingParams): Promise<UpsertMerchantMappingResult> {
  // Step 1: Validate that the category exists
  await ensureCategoryExists(supabase, input.categoryId);

  // Step 2: Normalize the merchant name to generate the merchant key
  const merchantKey = normalizeMerchantName(input.merchantName);

  // Step 3: Check if a mapping already exists (to determine if it's a create or update)
  const { data: existingMapping } = await supabase
    .from("merchant_mappings")
    .select("id")
    .eq("user_id", userId)
    .eq("merchant_key", merchantKey)
    .maybeSingle();

  const wasCreated = !existingMapping;

  // Step 4: Perform the upsert operation
  const payload: Omit<MerchantMappingInsert, "user_id"> = {
    merchant_key: merchantKey,
    category_id: input.categoryId,
  };

  const { data, error } = await supabase
    .from("merchant_mappings")
    .upsert(
      {
        ...payload,
        user_id: userId,
      },
      {
        onConflict: "user_id,merchant_key",
      }
    )
    .select()
    .single<MerchantMappingRow>();

  if (error) {
    // Check for foreign key constraint violation (PostgreSQL error code 23503)
    if (error.code === "23503") {
      throw new UpsertMerchantMappingError("CATEGORY_NOT_FOUND", "Category does not exist", {
        cause: { error, userId, merchantKey, categoryId: input.categoryId, requestId },
      });
    }

    throw new UpsertMerchantMappingError("MERCHANT_MAPPING_UPSERT_FAILED", "Failed to save merchant mapping", {
      cause: { error, userId, merchantKey, categoryId: input.categoryId, requestId },
    });
  }

  return {
    merchantMapping: toMerchantMappingDTO(data),
    wasCreated,
  };
}


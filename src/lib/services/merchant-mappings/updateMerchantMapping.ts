import type { Tables } from "../../../db/database.types";
import type { SupabaseClient } from "../../../db/supabase.client";
import type { MerchantMappingDTO, UpdateMerchantMappingCommand } from "../../../types";

export type UpdateMerchantMappingErrorCode = "MERCHANT_MAPPING_UPDATE_FAILED" | "MERCHANT_MAPPING_NOT_FOUND";

export class UpdateMerchantMappingError extends Error {
  public readonly code: UpdateMerchantMappingErrorCode;

  constructor(code: UpdateMerchantMappingErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "UpdateMerchantMappingError";
    this.code = code;

    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}

interface UpdateMerchantMappingParams {
  supabase: SupabaseClient;
  id: string;
  command: UpdateMerchantMappingCommand;
  requestId?: string;
}

type MerchantMappingRow = Tables<"merchant_mappings">;

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
 * Updates the category associated with an existing merchant mapping.
 *
 * This function performs an UPDATE operation on the merchant_mappings table,
 * filtering by the mapping ID. Row Level Security (RLS) ensures that only
 * mappings owned by the authenticated user can be updated.
 *
 * @param params - The parameters for the update operation
 * @returns A promise that resolves to the updated merchant mapping DTO
 * @throws UpdateMerchantMappingError if the operation fails or no mapping is found
 */
export async function updateMerchantMapping({
  supabase,
  id,
  command,
  requestId,
}: UpdateMerchantMappingParams): Promise<MerchantMappingDTO> {
  const { data, error } = await supabase
    .from("merchant_mappings")
    .update({ category_id: command.categoryId })
    .eq("id", id)
    .select()
    .single<MerchantMappingRow>();

  if (error) {
    // Check if the error indicates no rows were affected (PostgreSQL error code PGRST116)
    if (error.code === "PGRST116") {
      throw new UpdateMerchantMappingError("MERCHANT_MAPPING_NOT_FOUND", "Merchant mapping not found", {
        cause: { error, id, categoryId: command.categoryId, requestId },
      });
    }

    throw new UpdateMerchantMappingError("MERCHANT_MAPPING_UPDATE_FAILED", "Failed to update merchant mapping", {
      cause: { error, id, categoryId: command.categoryId, requestId },
    });
  }

  return toMerchantMappingDTO(data);
}

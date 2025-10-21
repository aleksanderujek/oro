import type { SupabaseClient } from "../../../db/supabase.client";

export type DeleteMerchantMappingErrorCode = "MERCHANT_MAPPING_DELETE_FAILED" | "MERCHANT_MAPPING_NOT_FOUND";

export class DeleteMerchantMappingError extends Error {
  public readonly code: DeleteMerchantMappingErrorCode;

  constructor(code: DeleteMerchantMappingErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "DeleteMerchantMappingError";
    this.code = code;

    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}

interface DeleteMerchantMappingParams {
  supabase: SupabaseClient;
  id: string;
  userId: string;
  requestId?: string;
}

/**
 * Deletes a merchant mapping by ID for a specific user.
 *
 * This function performs a DELETE operation on the merchant_mappings table,
 * filtering by both the mapping ID and the user ID to ensure proper authorization.
 * Row Level Security (RLS) provides additional protection at the database level.
 *
 * @param params - The parameters for the delete operation
 * @returns A promise that resolves to the ID of the deleted merchant mapping
 * @throws DeleteMerchantMappingError if the operation fails or no mapping is found
 */
export async function deleteMerchantMapping({
  supabase,
  id,
  userId,
  requestId,
}: DeleteMerchantMappingParams): Promise<string> {
  const { data, error } = await supabase
    .from("merchant_mappings")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select("id")
    .single();

  if (error) {
    // Check if the error indicates no rows were affected (PostgreSQL error code PGRST116)
    if (error.code === "PGRST116") {
      throw new DeleteMerchantMappingError("MERCHANT_MAPPING_NOT_FOUND", "Merchant mapping not found", {
        cause: { error, id, userId, requestId },
      });
    }

    throw new DeleteMerchantMappingError("MERCHANT_MAPPING_DELETE_FAILED", "Failed to delete merchant mapping", {
      cause: { error, id, userId, requestId },
    });
  }

  return data.id;
}

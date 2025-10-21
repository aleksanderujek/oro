import type { Tables } from "../../../db/database.types";
import type { SupabaseClient } from "../../../db/supabase.client";
import type { MerchantMappingDTO, MerchantMappingListResponse } from "../../../types";

export type GetMerchantMappingsErrorCode = "MERCHANT_MAPPINGS_QUERY_FAILED" | "INVALID_CURSOR";

export class GetMerchantMappingsError extends Error {
  public readonly code: GetMerchantMappingsErrorCode;

  constructor(code: GetMerchantMappingsErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "GetMerchantMappingsError";
    this.code = code;

    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}

interface GetMerchantMappingsParams {
  supabase: SupabaseClient;
  userId: string;
  search?: string;
  limit: number;
  cursor?: string;
  requestId?: string;
}

type MerchantMappingRow = Tables<"merchant_mappings">;

interface ParsedCursor {
  merchantKey: string;
  id: string;
}

/**
 * Maps a database row to a MerchantMappingDTO.
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
 * Encodes a cursor for keyset pagination.
 * Format: "merchant_key|id"
 */
function encodeMerchantMappingCursor(merchantKey: string, id: string): string {
  return `${merchantKey}|${id}`;
}

/**
 * Parses a cursor string into its components.
 * Format: "merchant_key|id"
 */
function parseMerchantMappingCursor(cursor: string): ParsedCursor {
  const lastPipeIndex = cursor.lastIndexOf("|");

  if (lastPipeIndex === -1) {
    throw new GetMerchantMappingsError("INVALID_CURSOR", "Cursor format is invalid. Expected format: merchant_key|id");
  }

  const merchantKey = cursor.substring(0, lastPipeIndex);
  const id = cursor.substring(lastPipeIndex + 1);

  if (!merchantKey || !id) {
    throw new GetMerchantMappingsError("INVALID_CURSOR", "Cursor components cannot be empty");
  }

  return { merchantKey, id };
}

/**
 * Computes the next cursor from the result set.
 * Returns null if there are no more results.
 */
function computeNextCursor(rows: MerchantMappingRow[], limit: number): string | null {
  if (rows.length <= limit) {
    return null;
  }

  const next = rows[limit];
  return encodeMerchantMappingCursor(next.merchant_key, next.id);
}

/**
 * Escapes special characters for LIKE pattern matching.
 */
function escapeForLike(term: string): string {
  return term.replace(/[%_]/g, "\\$&");
}

/**
 * Escapes special characters in values for PostgREST query syntax.
 * Commas are special characters in PostgREST filter syntax and must be escaped.
 */
function escapePostgrestValue(value: string): string {
  return value.replace(/,/g, "\\,");
}

/**
 * Retrieves a paginated list of merchant mappings for a user.
 * Supports search by merchant_key using trigram matching and keyset pagination.
 *
 * @param params - The parameters for the query
 * @returns A promise that resolves to a MerchantMappingListResponse
 * @throws GetMerchantMappingsError if the query fails or cursor is invalid
 */
export async function getMerchantMappings({
  supabase,
  userId,
  search,
  limit,
  cursor,
  requestId,
}: GetMerchantMappingsParams): Promise<MerchantMappingListResponse> {
  // Build the base query
  const query = supabase
    .from("merchant_mappings")
    .select("*")
    .eq("user_id", userId)
    .order("merchant_key", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit + 1); // Fetch one extra to determine hasMore

  // Apply search filter using trigram similarity if provided
  if (search) {
    // Use ilike for fuzzy search with trigram index support
    query.ilike("merchant_key", `%${escapeForLike(search)}%`);
  }

  // Apply cursor for pagination if provided
  if (cursor) {
    const parsedCursor = parseMerchantMappingCursor(cursor);
    const safeMerchantKey = escapePostgrestValue(parsedCursor.merchantKey);
    const safeId = escapePostgrestValue(parsedCursor.id);

    // Keyset pagination: (merchant_key > cursor_merchant_key) OR (merchant_key = cursor_merchant_key AND id > cursor_id)
    // Note: PostgREST requires the .or() method with string syntax for complex OR conditions
    query.or(`merchant_key.gt.${safeMerchantKey},and(merchant_key.eq.${safeMerchantKey},id.gt.${safeId})`);
  }

  // Execute the query
  const { data, error } = await query;

  if (error) {
    throw new GetMerchantMappingsError("MERCHANT_MAPPINGS_QUERY_FAILED", "Unable to load merchant mappings", {
      cause: { error, userId, search, limit, cursor, requestId },
    });
  }

  // Process results
  const hasMore = data.length > limit;
  const items = data.slice(0, limit).map(toMerchantMappingDTO);
  const nextCursor = computeNextCursor(data, limit);

  return {
    items,
    nextCursor,
    hasMore,
  };
}

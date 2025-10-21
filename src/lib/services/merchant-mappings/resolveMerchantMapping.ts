import type { Tables } from "../../../db/database.types";
import type { SupabaseClient } from "../../../db/supabase.client";
import type { ResolveMerchantMappingMatchDTO } from "../../../types";

export type ResolveMerchantMappingErrorCode = "EXACT_MATCH_QUERY_FAILED" | "TRIGRAM_MATCH_QUERY_FAILED";

export class ResolveMerchantMappingError extends Error {
  public readonly code: ResolveMerchantMappingErrorCode;

  constructor(code: ResolveMerchantMappingErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "ResolveMerchantMappingError";
    this.code = code;

    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}

interface ResolveMerchantMappingParams {
  supabase: SupabaseClient;
  userId: string;
  merchantName: string;
  requestId?: string;
}

type MerchantMappingRow = Tables<"merchant_mappings">;

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
 * Attempts to find an exact match for the normalized merchant name.
 *
 * @param supabase - The Supabase client
 * @param userId - The user's ID
 * @param merchantKey - The normalized merchant key
 * @returns The matching row or null if not found
 * @throws ResolveMerchantMappingError if the query fails
 */
async function findExactMatch(
  supabase: SupabaseClient,
  userId: string,
  merchantKey: string,
  requestId?: string
): Promise<MerchantMappingRow | null> {
  const { data, error } = await supabase
    .from("merchant_mappings")
    .select("*")
    .eq("user_id", userId)
    .eq("merchant_key", merchantKey)
    .maybeSingle();

  if (error) {
    throw new ResolveMerchantMappingError(
      "EXACT_MATCH_QUERY_FAILED",
      "Failed to query for exact merchant mapping match",
      { cause: { error, userId, merchantKey, requestId } }
    );
  }

  return data;
}

/**
 * Attempts to find the best trigram similarity match with confidence >= 0.8.
 *
 * Uses PostgreSQL's trigram similarity() function via a database RPC for precise matching.
 *
 * @param supabase - The Supabase client
 * @param userId - The user's ID
 * @param merchantKey - The normalized merchant key
 * @returns An object with the row and similarity score, or null if no suitable match found
 * @throws ResolveMerchantMappingError if the query fails
 */
async function findTrigramMatch(
  supabase: SupabaseClient,
  userId: string,
  merchantKey: string,
  requestId?: string
): Promise<{ row: MerchantMappingRow; similarity: number } | null> {
  // Call the database function to find the best trigram match
  // The function uses PostgreSQL's similarity() function for accurate scoring
  const { data, error } = await supabase.rpc("find_best_merchant_match", {
    p_user_id: userId,
    p_merchant_key: merchantKey,
    p_threshold: 0.8,
  });

  if (error) {
    throw new ResolveMerchantMappingError(
      "TRIGRAM_MATCH_QUERY_FAILED",
      "Failed to query for trigram merchant mapping match",
      { cause: { error, userId, merchantKey, requestId } }
    );
  }

  // The RPC returns null if no match found, or an array with a single row
  if (!data || data.length === 0) {
    return null;
  }

  const match = data[0];

  return {
    row: {
      id: match.id,
      user_id: match.user_id,
      merchant_key: match.merchant_key,
      category_id: match.category_id,
      updated_at: match.updated_at,
    },
    similarity: match.similarity,
  };
}

/**
 * Resolves a raw merchant name to a pre-configured category mapping.
 *
 * The resolution process follows a two-step approach:
 * 1. Exact match: Normalizes the input and searches for an exact match (confidence = 1.0)
 * 2. Trigram match: If no exact match, searches for the best trigram similarity match (confidence >= 0.8)
 *
 * @param params - The parameters for the resolution
 * @returns A promise that resolves to a ResolveMerchantMappingMatchDTO or null if no match found
 * @throws ResolveMerchantMappingError if any database query fails
 */
export async function resolveMerchantMapping({
  supabase,
  userId,
  merchantName,
  requestId,
}: ResolveMerchantMappingParams): Promise<ResolveMerchantMappingMatchDTO | null> {
  // Step 1: Normalize the merchant name
  const merchantKey = normalizeMerchantName(merchantName);

  // Step 2: Try exact match first
  const exactMatch = await findExactMatch(supabase, userId, merchantKey, requestId);

  if (exactMatch) {
    return {
      categoryId: exactMatch.category_id,
      confidence: 1.0,
      matchType: "exact",
      merchantKey: exactMatch.merchant_key,
    };
  }

  // Step 3: Try trigram similarity match
  const trigramMatch = await findTrigramMatch(supabase, userId, merchantKey, requestId);

  if (trigramMatch) {
    return {
      categoryId: trigramMatch.row.category_id,
      confidence: trigramMatch.similarity,
      matchType: "trigram",
      merchantKey: trigramMatch.row.merchant_key,
    };
  }

  // No match found
  return null;
}

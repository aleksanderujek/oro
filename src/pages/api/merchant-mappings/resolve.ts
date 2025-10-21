import type { APIRoute } from "astro";

import { buildErrorResponse, buildJsonResponse, getRequestId } from "../../../lib/http/responses";
import { buildValidationErrorResponse } from "../../../lib/http/validation";
import { ResolveMerchantMappingQuerySchema } from "../../../lib/validation/merchant-mappings";
import { resolveMerchantMapping, ResolveMerchantMappingError } from "../../../lib/services/merchant-mappings";
import type { ResolveMerchantMappingResponse } from "../../../types";

export const prerender = false;

/**
 * GET /api/merchant-mappings/resolve
 *
 * Resolves a raw merchant name to a pre-configured category mapping.
 *
 * Query Parameters:
 * - name: string (required) - The raw merchant name to resolve
 *
 * Returns:
 * - 200: ResolveMerchantMappingResponse with match (exact/trigram) or null
 * - 400: Invalid query parameters
 * - 401: Authentication required
 * - 500: Server error
 */
export const GET: APIRoute = async ({ request, locals }) => {
  const requestId = getRequestId(request);
  const supabase = locals.supabase;
  const session = locals.session;

  // Validate Supabase client availability
  if (!supabase) {
    return buildErrorResponse(
      500,
      { code: "SUPABASE_NOT_AVAILABLE", message: "Supabase client not available" },
      requestId
    );
  }

  // Validate authentication
  if (!session) {
    return buildErrorResponse(401, { code: "UNAUTHORIZED", message: "Authentication required" }, requestId);
  }

  // Parse and validate query parameters
  let queryParams;

  try {
    const searchParams = new URL(request.url).searchParams;
    const rawParams = Object.fromEntries(searchParams.entries());
    queryParams = ResolveMerchantMappingQuerySchema.parse(rawParams);
  } catch (error) {
    return buildValidationErrorResponse(error, {
      requestId,
      defaultMessage: "Invalid query parameters",
      code: "INVALID_QUERY",
    });
  }

  // Resolve merchant mapping
  try {
    const match = await resolveMerchantMapping({
      supabase,
      userId: session.user.id,
      merchantName: queryParams.name,
      requestId,
    });

    const response: ResolveMerchantMappingResponse = {
      match,
    };

    return buildJsonResponse(response, 200, requestId);
  } catch (error) {
    if (error instanceof ResolveMerchantMappingError) {
      // Map service errors to appropriate HTTP status codes
      switch (error.code) {
        case "EXACT_MATCH_QUERY_FAILED":
        case "TRIGRAM_MATCH_QUERY_FAILED":
          return buildErrorResponse(
            500,
            { code: error.code, message: "Unable to resolve merchant mapping" },
            requestId
          );
        default:
          return buildErrorResponse(500, { code: error.code, message: error.message }, requestId);
      }
    }

    // Unexpected error
    return buildErrorResponse(500, { code: "UNKNOWN_ERROR", message: "Unable to resolve merchant mapping" }, requestId);
  }
};

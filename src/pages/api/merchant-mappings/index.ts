import type { APIRoute } from "astro";

import { buildErrorResponse, buildJsonResponse, getRequestId } from "../../../lib/http/responses";
import { buildValidationErrorResponse } from "../../../lib/http/validation";
import { GetMerchantMappingsQuerySchema } from "../../../lib/validation/merchant-mappings";
import { getMerchantMappings, GetMerchantMappingsError } from "../../../lib/services/merchant-mappings";

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  const requestId = getRequestId(request);
  const supabase = locals.supabase;
  const session = locals.session;

  if (!supabase) {
    return buildErrorResponse(
      500,
      { code: "SUPABASE_NOT_AVAILABLE", message: "Supabase client not available" },
      requestId
    );
  }

  if (!session) {
    return buildErrorResponse(401, { code: "UNAUTHORIZED", message: "Authentication required" }, requestId);
  }

  let queryParams;

  try {
    const searchParams = new URL(request.url).searchParams;
    const rawParams = Object.fromEntries(searchParams.entries());
    queryParams = GetMerchantMappingsQuerySchema.parse(rawParams);
  } catch (error) {
    return buildValidationErrorResponse(error, {
      requestId,
      defaultMessage: "Invalid query parameters",
      code: "INVALID_QUERY",
    });
  }

  try {
    const result = await getMerchantMappings({
      supabase,
      userId: session.user.id,
      search: queryParams.search,
      limit: queryParams.limit,
      cursor: queryParams.cursor,
      requestId,
    });

    return buildJsonResponse(result, 200, requestId);
  } catch (error) {
    if (error instanceof GetMerchantMappingsError) {
      switch (error.code) {
        case "INVALID_CURSOR":
          return buildErrorResponse(400, { code: error.code, message: error.message }, requestId);
        case "MERCHANT_MAPPINGS_QUERY_FAILED":
          return buildErrorResponse(
            500,
            { code: error.code, message: "Unable to load merchant mappings" },
            requestId
          );
        default:
          return buildErrorResponse(400, { code: error.code, message: error.message }, requestId);
      }
    }

    return buildErrorResponse(500, { code: "UNKNOWN_ERROR", message: "Unable to load merchant mappings" }, requestId);
  }
};


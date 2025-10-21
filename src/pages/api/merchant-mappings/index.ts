import type { APIRoute } from "astro";

import { buildErrorResponse, buildJsonResponse, getRequestId } from "../../../lib/http/responses";
import { buildValidationErrorResponse } from "../../../lib/http/validation";
import {
  GetMerchantMappingsQuerySchema,
  UpsertMerchantMappingCommandSchema,
} from "../../../lib/validation/merchant-mappings";
import {
  getMerchantMappings,
  GetMerchantMappingsError,
  upsertMerchantMapping,
  UpsertMerchantMappingError,
} from "../../../lib/services/merchant-mappings";

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
          return buildErrorResponse(500, { code: error.code, message: "Unable to load merchant mappings" }, requestId);
        default:
          return buildErrorResponse(400, { code: error.code, message: error.message }, requestId);
      }
    }

    return buildErrorResponse(500, { code: "UNKNOWN_ERROR", message: "Unable to load merchant mappings" }, requestId);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
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

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return buildErrorResponse(400, { code: "INVALID_JSON", message: "Request body must be valid JSON" }, requestId);
  }

  let command;

  try {
    command = UpsertMerchantMappingCommandSchema.parse(payload);
  } catch (error) {
    return buildValidationErrorResponse(error, {
      requestId,
      defaultMessage: "Invalid request payload",
      code: "VALIDATION_ERROR",
    });
  }

  try {
    const result = await upsertMerchantMapping({
      supabase,
      userId: session.user.id,
      input: command,
      requestId,
    });

    // Return 201 Created if new mapping was created, 200 OK if existing mapping was updated
    const statusCode = result.wasCreated ? 201 : 200;
    return buildJsonResponse(result.merchantMapping, statusCode, requestId);
  } catch (error) {
    if (error instanceof UpsertMerchantMappingError) {
      switch (error.code) {
        case "CATEGORY_NOT_FOUND":
          return buildErrorResponse(400, { code: error.code, message: error.message }, requestId);
        case "CATEGORY_LOOKUP_FAILED":
        case "MERCHANT_MAPPING_UPSERT_FAILED":
          return buildErrorResponse(500, { code: error.code, message: "Unable to save merchant mapping" }, requestId);
        default:
          return buildErrorResponse(500, { code: error.code, message: "Unable to save merchant mapping" }, requestId);
      }
    }

    return buildErrorResponse(500, { code: "UNKNOWN_ERROR", message: "Unable to save merchant mapping" }, requestId);
  }
};

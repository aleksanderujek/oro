import type { APIRoute } from "astro";

import { buildErrorResponse, buildJsonResponse, getRequestId } from "../../../lib/http/responses";
import { buildValidationErrorResponse } from "../../../lib/http/validation";
import { UpdateMerchantMappingCommandSchema } from "../../../lib/validation/merchant-mappings";
import { validateMerchantMappingId } from "../../../lib/validators/merchant-mappings";
import {
  updateMerchantMapping,
  UpdateMerchantMappingError,
  deleteMerchantMapping,
  DeleteMerchantMappingError,
} from "../../../lib/services/merchant-mappings";
import type { DeleteMerchantMappingResponse } from "../../../types";

export const prerender = false;

export const PATCH: APIRoute = async ({ params, request, locals }) => {
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

  // Extract and validate merchant mapping ID from params
  let merchantMappingId: string;

  try {
    merchantMappingId = validateMerchantMappingId(params.id);
  } catch (error) {
    return buildValidationErrorResponse(error, {
      requestId,
      defaultMessage: "Invalid merchant mapping ID",
      code: "INVALID_MERCHANT_MAPPING_ID",
    });
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return buildErrorResponse(400, { code: "INVALID_JSON", message: "Request body must be valid JSON" }, requestId);
  }

  let command;

  try {
    command = UpdateMerchantMappingCommandSchema.parse(payload);
  } catch (error) {
    return buildValidationErrorResponse(error, {
      requestId,
      defaultMessage: "Invalid request payload",
      code: "VALIDATION_ERROR",
    });
  }

  try {
    const result = await updateMerchantMapping({
      supabase,
      id: merchantMappingId,
      command,
      requestId,
    });

    return buildJsonResponse(result, 200, requestId);
  } catch (error) {
    if (error instanceof UpdateMerchantMappingError) {
      switch (error.code) {
        case "MERCHANT_MAPPING_NOT_FOUND":
          return buildErrorResponse(404, { code: error.code, message: error.message }, requestId);
        case "MERCHANT_MAPPING_UPDATE_FAILED":
          return buildErrorResponse(500, { code: error.code, message: "Unable to update merchant mapping" }, requestId);
        default:
          return buildErrorResponse(500, { code: error.code, message: "Unable to update merchant mapping" }, requestId);
      }
    }

    return buildErrorResponse(500, { code: "UNKNOWN_ERROR", message: "Unable to update merchant mapping" }, requestId);
  }
};

export const DELETE: APIRoute = async ({ params, request, locals }) => {
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

  // Extract and validate merchant mapping ID from params
  let merchantMappingId: string;

  try {
    merchantMappingId = validateMerchantMappingId(params.id);
  } catch (error) {
    return buildValidationErrorResponse(error, {
      requestId,
      defaultMessage: "Invalid merchant mapping ID",
      code: "INVALID_MERCHANT_MAPPING_ID",
    });
  }

  try {
    const deletedId = await deleteMerchantMapping({
      supabase,
      id: merchantMappingId,
      userId: session.user.id,
      requestId,
    });

    const response: DeleteMerchantMappingResponse = {
      id: deletedId,
      deleted: true,
    };

    return buildJsonResponse(response, 200, requestId);
  } catch (error) {
    if (error instanceof DeleteMerchantMappingError) {
      switch (error.code) {
        case "MERCHANT_MAPPING_NOT_FOUND":
          return buildErrorResponse(404, { code: error.code, message: error.message }, requestId);
        case "MERCHANT_MAPPING_DELETE_FAILED":
          return buildErrorResponse(500, { code: error.code, message: "Unable to delete merchant mapping" }, requestId);
        default:
          return buildErrorResponse(500, { code: error.code, message: "Unable to delete merchant mapping" }, requestId);
      }
    }

    return buildErrorResponse(500, { code: "UNKNOWN_ERROR", message: "Unable to delete merchant mapping" }, requestId);
  }
};

import type { APIRoute } from "astro";

import { buildErrorResponse, buildJsonResponse, getRequestId } from "../../lib/http/responses";
import { buildValidationErrorResponse } from "../../lib/http/validation";
import { getDashboardData, GetDashboardDataError } from "../../lib/services/dashboard";
import { normalizeDashboardQuery } from "../../lib/validators/dashboard";

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
    queryParams = normalizeDashboardQuery(searchParams);
  } catch (error) {
    return buildValidationErrorResponse(error, {
      requestId,
      defaultMessage: "Invalid query parameters",
      code: "INVALID_QUERY",
    });
  }

  try {
    const result = await getDashboardData({
      supabase,
      userId: session.user.id,
      options: {
        month: queryParams.month,
        timezone: "", // Will be fetched from profile in the service
        account: queryParams.account,
        categoryIds: queryParams.categoryIds,
      },
      requestId,
    });

    return buildJsonResponse(result, 200, requestId);
  } catch (error) {
    if (error instanceof GetDashboardDataError) {
      switch (error.code) {
        case "PROFILE_NOT_FOUND":
          return buildErrorResponse(403, { code: error.code, message: error.message }, requestId);
        case "INVALID_MONTH_FORMAT":
          return buildErrorResponse(400, { code: error.code, message: error.message }, requestId);
        case "PROFILE_LOOKUP_FAILED":
        case "DASHBOARD_METRICS_FAILED":
          return buildErrorResponse(500, { code: error.code, message: "Unable to load dashboard data" }, requestId);
        default:
          return buildErrorResponse(500, { code: error.code, message: "Unable to load dashboard data" }, requestId);
      }
    }

    return buildErrorResponse(500, { code: "UNKNOWN_ERROR", message: "Unable to load dashboard data" }, requestId);
  }
};


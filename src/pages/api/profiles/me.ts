import type { APIRoute } from "astro";

import { buildErrorResponse, buildJsonResponse, getRequestId } from "../../../lib/http/responses";
import { getProfile, GetProfileError } from "../../../lib/services/profiles/getProfile";

export const prerender = false;

export const GET: APIRoute = async ({ locals, request }) => {
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

  try {
    const profile = await getProfile({
      supabase,
      userId: session.user.id,
      requestId,
    });

    return buildJsonResponse(profile, 200, requestId);
  } catch (error) {
    if (error instanceof GetProfileError) {
      switch (error.code) {
        case "PROFILE_NOT_FOUND":
          return buildErrorResponse(403, { code: error.code, message: error.message }, requestId);
        case "INVALID_ACCOUNT_TYPE":
          return buildErrorResponse(500, { code: error.code, message: error.message }, requestId);
        case "PROFILE_LOOKUP_FAILED":
        default:
          return buildErrorResponse(500, { code: error.code, message: "Unable to load profile" }, requestId);
      }
    }

    return buildErrorResponse(500, { code: "UNKNOWN_ERROR", message: "Unable to load profile" }, requestId);
  }
};

import type { APIRoute } from "astro";

import { ZodError } from "zod";

import { buildErrorResponse, buildJsonResponse, getRequestId } from "../../../lib/http/responses";
import { getProfile, GetProfileError } from "../../../lib/services/profiles/getProfile";
import { updateProfile } from "../../../lib/services/profiles/updateProfile";
import { UpdateProfileError } from "../../../lib/services/profiles/errors";
import { validateUpdateProfileCommand } from "../../../lib/validators/profiles";

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

export const PATCH: APIRoute = async ({ locals, request }) => {
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
    command = validateUpdateProfileCommand(payload);
  } catch (validationError) {
    if (validationError instanceof ZodError) {
      return buildErrorResponse(
        400,
        { code: "INVALID_REQUEST", message: validationError.errors[0]?.message ?? "Invalid request" },
        requestId
      );
    }

    return buildErrorResponse(400, { code: "INVALID_REQUEST", message: "Invalid request" }, requestId);
  }

  try {
    const profile = await updateProfile({
      supabase,
      userId: session.user.id,
      command,
      requestId,
    });

    return buildJsonResponse(profile, 200, requestId);
  } catch (error) {
    if (error instanceof UpdateProfileError) {
      switch (error.code) {
        case "INVALID_TIMEZONE":
        case "INVALID_ACCOUNT_TYPE":
          return buildErrorResponse(400, { code: error.code, message: error.message }, requestId);
        case "PROFILE_NOT_FOUND":
          return buildErrorResponse(403, { code: error.code, message: error.message }, requestId);
        case "PROFILE_UPDATE_FAILED":
        default:
          return buildErrorResponse(500, { code: error.code, message: "Unable to update profile" }, requestId);
      }
    }

    return buildErrorResponse(500, { code: "UNKNOWN_ERROR", message: "Unable to update profile" }, requestId);
  }
};

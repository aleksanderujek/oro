import type { APIRoute } from "astro";
import { z } from "zod";

import { buildErrorResponse, buildJsonResponse, getRequestId } from "../../lib/http/responses";
import { listCategories, ListCategoriesError } from "../../lib/services/categories";

export const prerender = false;

const IncludeUncategorizedSchema = z
  .union([
    z.literal("true"),
    z.literal("false"),
    z.literal("1"),
    z.literal("0"),
    z.literal("on"),
    z.literal("off"),
    z.literal("yes"),
    z.literal("no"),
  ])
  .transform((value) => {
    switch (value) {
      case "false":
      case "0":
      case "off":
      case "no":
        return false;
      default:
        return true;
    }
  });

function parseIncludeUncategorized(params: URLSearchParams): boolean {
  const rawValue = params.get("includeUncategorized");

  if (rawValue === null) {
    return true;
  }

  const parsed = IncludeUncategorizedSchema.safeParse(rawValue.toLowerCase());

  if (!parsed.success) {
    throw parsed.error;
  }

  return parsed.data;
}

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

  let includeUncategorized: boolean;

  try {
    const url = new URL(request.url);
    includeUncategorized = parseIncludeUncategorized(url.searchParams);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid query parameter";

    return buildErrorResponse(400, { code: "INVALID_QUERY", message }, requestId);
  }

  try {
    const result = await listCategories({
      supabase,
      includeUncategorized,
      requestId,
    });

    const response = buildJsonResponse(result, 200, requestId);

    response.headers.set("Cache-Control", "public, max-age=300, stale-while-revalidate=86400");

    return response;
  } catch (error) {
    if (error instanceof ListCategoriesError) {
      return buildErrorResponse(500, { code: error.code, message: "Unable to load categories" }, requestId);
    }

    return buildErrorResponse(500, { code: "UNKNOWN_ERROR", message: "Unable to load categories" }, requestId);
  }
};

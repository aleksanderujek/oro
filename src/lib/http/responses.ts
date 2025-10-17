export interface ErrorBody {
  code: string;
  message: string;
}

function buildHeaders(requestId?: string): Headers {
  const headers = new Headers({
    "Content-Type": "application/json",
  });

  if (requestId) {
    headers.set("X-Request-Id", requestId);
  }

  return headers;
}

export function buildJsonResponse<T>(body: T, status: number, requestId?: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: buildHeaders(requestId),
  });
}

export function buildErrorResponse(status: number, body: ErrorBody, requestId?: string): Response {
  return buildJsonResponse(body, status, requestId);
}

export function getRequestId(request: Request): string | undefined {
  return request.headers.get("x-request-id") ?? undefined;
}

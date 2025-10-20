# API Endpoint Implementation Plan: GET /merchant-mappings

## 1. Endpoint Overview

This document outlines the implementation plan for the `GET /merchant-mappings` REST API endpoint. The purpose of this endpoint is to retrieve a paginated list of merchant mappings for the currently authenticated user. It supports searching by merchant name and uses keyset pagination for efficient data fetching. This endpoint is primarily intended for use in the settings UI to allow users to manage their custom mapping rules.

## 2. Request Details

-   **HTTP Method**: `GET`
-   **URL Structure**: `/api/merchant-mappings`
-   **Parameters**:
    -   **Optional**:
        -   `search` (string): Filters the list of mappings where the `merchant_key` is similar to the provided string (using trigram matching).
        -   `limit` (number): The maximum number of items to return. Defaults to `20`, with a maximum of `100`.
        -   `cursor` (string): An opaque string used for keyset pagination. It represents the starting point for the next page of results. The format is `merchant_key|id`.

-   **Request Body**: None.

## 3. Used Types

The implementation will use the following existing DTOs from `src/types.ts`:

-   `MerchantMappingDTO`: Represents a single merchant mapping record.
-   `MerchantMappingListResponse`: The top-level object for the response payload.

```typescript:src/types.ts
export interface MerchantMappingDTO {
  id: MerchantMappingRow["id"];
  merchantKey: MerchantMappingRow["merchant_key"];
  categoryId: MerchantMappingRow["category_id"];
  updatedAt: MerchantMappingRow["updated_at"];
}

export interface MerchantMappingListResponse {
  items: MerchantMappingDTO[];
  nextCursor: CursorString | null;
  hasMore: boolean;
}
```

## 4. Response Details

-   **Success Response**: `200 OK`
    -   **Payload**: A `MerchantMappingListResponse` object.

    ```json
    {
      "items": [
        {
          "id": "uuid-goes-here",
          "merchantKey": "starbucks",
          "categoryId": "uuid-of-category",
          "updatedAt": "2025-10-20T10:00:00Z"
        }
      ],
      "nextCursor": "starbucks|uuid-goes-here",
      "hasMore": true
    }
    ```

-   **Error Responses**:
    -   `400 Bad Request`: Returned when query parameters are invalid.
    -   `401 Unauthorized`: Returned if the user is not authenticated.
    -   `500 Internal Server Error`: Returned for unexpected server-side errors.

## 5. Data Flow

1.  A `GET` request is made to `/api/merchant-mappings`.
2.  The Astro middleware intercepts the request to verify the user's authentication status. If the user is not authenticated, it returns a `401 Unauthorized` error.
3.  The request is routed to the API handler at `src/pages/api/merchant-mappings/index.ts`.
4.  The handler uses a Zod schema to parse and validate the query parameters (`search`, `limit`, `cursor`). If validation fails, it returns a `400 Bad Request` error.
5.  The handler calls the `getMerchantMappings` service function located in `src/lib/services/merchant-mappings/getMerchantMappings.ts`, passing the validated parameters and the user's ID.
6.  The `getMerchantMappings` service constructs a Supabase query to fetch data from the `merchant_mappings` table.
    -   The query is filtered by the `user_id` to ensure data isolation.
    -   If a `search` term is provided, a `WHERE` clause with the trigram similarity operator (`%`) is added.
    -   If a `cursor` is provided, it is parsed to add a `WHERE` clause for pagination: `WHERE (merchant_key, id) > (:cursor_merchant_key, :cursor_id)`.
    -   The results are ordered by `merchant_key ASC, id ASC`.
    -   The query fetches `limit + 1` records to determine if more results exist (`hasMore`).
7.  The service function maps the database rows to `MerchantMappingDTO` objects.
8.  It constructs the `nextCursor` from the last item if `hasMore` is true.
9.  The service returns a `MerchantMappingListResponse` object to the API handler.
10. The API handler sends the response back to the client with a `200 OK` status.

## 6. Security Considerations

-   **Authentication**: The endpoint will be protected by the existing authentication middleware, ensuring that only logged-in users can access it.
-   **Authorization**: All database queries will be strictly scoped by the `user_id` associated with the current session. This is the most critical security measure to prevent data leakage between users.
-   **Input Validation**: Query parameters will be rigorously validated using Zod to prevent invalid data from reaching the service layer. The `limit` parameter will be capped to prevent DoS attacks via resource exhaustion.
-   **Data Access**: The Supabase client will be used for all database interactions, leveraging its built-in protection against SQL injection.

## 7. Performance Considerations

-   **Database Indexing**: To ensure fast query performance, the following database indexes are required on the `merchant_mappings` table:
    -   A composite index on `(user_id, merchant_key, id)` to optimize filtering, sorting, and pagination.
    -   A GIN or GIST index on the `merchant_key` column using the `pg_trgm` extension to accelerate trigram similarity searches.
-   **Pagination**: Keyset pagination is specified, which is highly performant and scalable compared to offset-based pagination, as it avoids full table scans on deep pages.

## 8. Implementation Steps

1.  **Database**:
    -   Create a new database migration to add a GIN index on the `merchant_key` column for trigram search if it doesn't already exist.
    -   Verify that a composite index exists on `(user_id, merchant_key, id)`.

2.  **Validation**:
    -   Create a new file `src/lib/validation/merchant-mappings.ts`.
    -   Define a Zod schema `GetMerchantMappingsQuerySchema` to validate the `search`, `limit`, and `cursor` query parameters.

3.  **Service Layer**:
    -   Create a new directory `src/lib/services/merchant-mappings`.
    -   Create a new file `src/lib/services/merchant-mappings/getMerchantMappings.ts`.
    -   Implement the `getMerchantMappings` function, which will contain the core logic for querying the database, handling pagination, and applying search filters.

4.  **API Route**:
    -   Create a new directory `src/pages/api/merchant-mappings`.
    -   Create a new file `src/pages/api/merchant-mappings/index.ts`.
    -   Implement the `GET` handler for the route.
    -   Use the Zod schema to validate incoming query parameters.
    -   Call the `getMerchantMappings` service function with the validated data.
    -   Implement `try...catch` block for error handling.
    -   Return the appropriate JSON response or error code.

5.  **Testing**:
    -   Add an API test file in `api-testing/merchant-mappings.http` to test the new endpoint with various query parameter combinations (no params, with limit, with search, with cursor). 
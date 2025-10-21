# API Endpoint Implementation Plan: Resolve Merchant Mapping

## 1. Endpoint Overview

This document outlines the implementation plan for the `GET /merchant-mappings/resolve` REST API endpoint. The endpoint's primary function is to resolve a given raw merchant name to a pre-configured category mapping. It employs a two-step matching process: first, it attempts an exact match on a normalized version of the merchant name; if unsuccessful, it performs a trigram similarity search to find the best possible match above a confidence threshold of 0.8.

## 2. Request Details

- **HTTP Method**: `GET`
- **URL Structure**: `/api/merchant-mappings/resolve`
- **Parameters**:
  - **Required**:
    - `name` (Query Parameter, `string`): The raw merchant name to be resolved. Must be a non-empty string.
  - **Optional**: None
- **Request Body**: None

## 3. Used Types

The implementation will use the following existing types defined in `src/types.ts`:

- `ResolveMerchantMappingResponse`: The top-level response object.
  ```typescript
  export interface ResolveMerchantMappingResponse {
    match: ResolveMerchantMappingMatchDTO | null;
  }
  ```
- `ResolveMerchantMappingMatchDTO`: The structure for a successful match.
  ```typescript
  export interface ResolveMerchantMappingMatchDTO {
    categoryId: MerchantMappingRow["category_id"];
    confidence: number;
    matchType: MerchantMappingMatchType;
    merchantKey: MerchantMappingRow["merchant_key"];
  }
  ```
- `MerchantMappingMatchType`: An enum for the match type.
  ```typescript
  export type MerchantMappingMatchType = "exact" | "trigram";
  ```

## 4. Data Flow

1.  A `GET` request is sent to `/api/merchant-mappings/resolve?name=<merchant_name>`.
2.  The Astro API route handler at `src/pages/api/merchant-mappings/resolve.ts` receives the request.
3.  The handler validates the `name` query parameter using a Zod schema. If validation fails, it returns a `400 Bad Request`.
4.  The handler retrieves the authenticated user's session from `Astro.locals`. If no user is found, middleware returns a `401 Unauthorized`.
5.  The handler calls the `resolveMerchantMapping` service function from `src/lib/services/merchant-mappings/resolveMerchantMapping.ts`, passing the Supabase client, user ID, and the raw merchant name.
6.  The service function orchestrates the matching logic in the application layer:
    a. It first normalizes the input merchant name (e.g., "The Coffee Shop" becomes "coffeeshop").
    b. It executes a database query to find an exact match for the normalized key in the `merchant_mappings` table, scoped to the current user.
    c. If an exact match is found, it is returned immediately with a confidence of `1.0` and a `matchType` of `exact`.
    d. If no exact match is found, the service makes a second database call. This call will execute a targeted query to find the best trigram similarity match with a confidence score `>= 0.8`.
    e. If a suitable trigram match is found, it is returned with its calculated confidence and a `matchType` of `trigram`.
    f. If no match is found after both steps, the service returns `null`.
7.  The service function returns the result to the API route handler.
8.  The handler constructs the final `ResolveMerchantMappingResponse` object and sends it back to the client with a `200 OK` status.

## 5. Security Considerations

- **Authentication**: The endpoint is protected. Access is restricted to authenticated users. This will be enforced by the existing Astro middleware that checks for a valid Supabase session.
- **Authorization**: All database queries must be scoped to the authenticated user's data. The `resolve_merchant_mapping` database function will use `auth.uid()` to ensure it only queries mappings belonging to the current user, leveraging the existing RLS policies.
- **Input Validation**: The `name` query parameter will be strictly validated using Zod to ensure it is a non-empty string, preventing invalid or malicious inputs from reaching the service layer.
- **SQL Injection**: The use of a Supabase RPC call with parameters inherently prevents SQL injection vulnerabilities, as the database engine handles parameter sanitization.

## 6. Error Handling

The following error scenarios will be handled:

| Status Code                 | Reason                                                               |
| :-------------------------- | :------------------------------------------------------------------- |
| `200 OK`                    | Successful request. The `match` property may be an object or `null`. |
| `400 Bad Request`           | The `name` query parameter is missing, empty, or not a string.       |
| `401 Unauthorized`          | The request lacks valid authentication credentials.                  |
| `500 Internal Server Error` | An unexpected error occurred on the server (e.g., database failure). |

## 7. Performance Considerations

- The `merchant_mappings` table has a unique B-tree index on `(user_id, merchant_key)`, which will make the exact match lookup extremely fast.
- A GIN trigram index exists on the `merchant_key` column, which is essential for making the fuzzy trigram similarity search performant, even as the table grows.
- This approach uses up to two separate database queries. While this introduces a second network round trip in the case of a cache miss on the exact match, it provides a clearer separation of concerns. Each individual query remains highly performant due to proper indexing.

## 8. Implementation Steps

1.  **Update Validation Schemas:**
    - In `src/lib/validation/merchant-mappings.ts`, add a new Zod schema for validating the query parameters of the resolve endpoint.

    ```typescript
    import { z } from "zod";

    // ... existing schemas
    export const resolveMerchantMappingSchema = z.object({
      name: z.string().min(1, "Merchant name cannot be empty"),
    });
    ```

2.  **Create the Service Function:**
    - Create a new file: `src/lib/services/merchant-mappings/resolveMerchantMapping.ts`.
    - Implement an async function `resolveMerchantMapping` that takes `supabase: SupabaseClient`, `userId: string`, and `merchantName: string` as arguments.
    - This function will first perform a standard `select` query for an exact match.
    - If no exact match is found, it will then perform a second query to find the best trigram match with a similarity `>= 0.8`. For the MVP, this trigram search query will be constructed and executed directly from the service function.
    - The function will return the data in the format of `ResolveMerchantMappingMatchDTO | null`.

3.  **Export the New Service Function:**
    - In `src/lib/services/merchant-mappings/index.ts`, export the `resolveMerchantMapping` function.

4.  **Create the API Endpoint:**
    - Create a new file: `src/pages/api/merchant-mappings/resolve.ts`.
    - Implement the `GET` handler for the API route.
    - Set `export const prerender = false;`.
    - Use `Astro.url.searchParams` to get the `name` parameter.
    - Validate the input using the `resolveMerchantMappingSchema`.
    - Get the Supabase client and user session from `Astro.locals`.
    - Call the `resolveMerchantMapping` service function.
    - Return the result with a `200 OK` status code using the `json` response helper from `src/lib/http/responses.ts`.

5.  **Add Endpoint Tests:**
    - Create a new file: `api-testing/resolve-merchant-mapping.http`.
    - Add requests to test the success case (with an existing mapping that gives an exact match), a case for a trigram match, a case where no match is found, and an error case (e.g., missing `name` parameter).

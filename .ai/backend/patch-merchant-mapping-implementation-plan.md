# API Endpoint Implementation Plan: Update Merchant Mapping

## 1. Endpoint Overview
This document outlines the implementation plan for the `PATCH /api/merchant-mappings/{id}` endpoint. Its purpose is to allow an authenticated user to update the category associated with one of their existing merchant mappings. The merchant identifier (`merchant_key`) is immutable and cannot be changed via this endpoint.

## 2. Request Details
-   **HTTP Method**: `PATCH`
-   **URL Structure**: `/api/merchant-mappings/{id}`
-   **Parameters**:
    -   **Required (Path)**:
        -   `id` (uuid): The unique identifier of the merchant mapping to be updated.
    -   **Optional**: None
-   **Request Body**:
    -   The request body must be a JSON object containing the fields to be updated.
    -   **Payload Structure**:
        ```json
        {
          "categoryId": "uuid"
        }
        ```
    -   **Fields**:
        -   `categoryId` (uuid, required): The new category ID to associate with the merchant mapping.

## 3. Used Types
The implementation will use the following existing DTOs and Command models from `src/types.ts`:

-   **Command Model**: `UpdateMerchantMappingCommand` - Represents the data structure for the request body.
-   **Response DTO**: `MerchantMappingDTO` - Defines the structure of the successful response body.

## 4. Response Details
-   **Success Response**:
    -   **Code**: `200 OK`
    -   **Payload**: A `MerchantMappingDTO` object representing the updated resource.
        ```json
        {
          "id": "uuid",
          "merchantKey": "string",
          "categoryId": "uuid",
          "updatedAt": "timestamptz"
        }
        ```
-   **Error Responses**:
    -   `400 Bad Request`
    -   `401 Unauthorized`
    -   `403 Forbidden`
    -   `404 Not Found`
    -   `500 Internal Server Error`

## 5. Data Flow
1.  A `PATCH` request is sent to `/api/merchant-mappings/{id}`.
2.  The Astro middleware (`src/middleware/index.ts`) intercepts the request to verify the user's authentication status via their session cookie.
3.  The request is routed to the `PATCH` handler in `src/pages/api/merchant-mappings/[id].ts`.
4.  The handler validates the `id` path parameter and the request body using a Zod schema defined in `src/lib/validation/merchant-mappings.ts`.
5.  The handler calls the `updateMerchantMapping` service function, passing the Supabase client instance, the mapping `id`, and the validated request payload.
6.  The `updateMerchantMapping` service in `src/lib/services/merchant-mappings/updateMerchantMapping.ts` executes a Supabase `update` query on the `merchant_mappings` table, filtering by `id`.
7.  PostgreSQL's Row Level Security (RLS) policy ensures the `UPDATE` operation only succeeds if the record's `user_id` matches the authenticated user's ID (`auth.uid()`).
8.  The service function checks if the update was successful. If no rows were affected, it throws a "Not Found" error.
9.  Upon a successful update, the service maps the returned database record to a `MerchantMappingDTO` and returns it to the handler.
10. The handler sends a `200 OK` response with the `MerchantMappingDTO` as the JSON payload.

## 6. Security Considerations
-   **Authentication**: Handled by the Astro middleware, ensuring that only authenticated users can access this endpoint.
-   **Authorization**: Enforced at the database level by Supabase Row Level Security (RLS), preventing users from modifying merchant mappings they do not own.
-   **Input Validation**: The Zod schema for the request body and path parameters will be strictly enforced to prevent invalid data from being processed and to protect against potential injection vectors.

## 7. Error Handling
The endpoint will handle the following error scenarios:
-   **400 Bad Request**: Returned if the `id` path parameter is not a valid UUID or if the request body fails validation (e.g., missing `categoryId`, incorrect data type, extra fields).
-   **401 Unauthorized**: Returned by the middleware if the request lacks a valid session.
-   **404 Not Found**: Returned if the `id` corresponds to no existing merchant mapping for the authenticated user. This is determined by the service layer if the database update operation affects zero rows.
-   **500 Internal Server Error**: Returned for any unhandled exceptions, such as database connection failures. Errors will be logged to the console for debugging.

## 8. Performance Considerations
-   The `UPDATE` operation targets a single record by its primary key (`id`), which is highly efficient and indexed by default in PostgreSQL.
-   No complex joins or computations are required.
-   The performance impact is expected to be minimal.

## 9. Implementation Steps
1.  **Define Validation Schema**:
    -   In `src/lib/validation/merchant-mappings.ts`, add a new Zod schema `updateMerchantMappingSchema` to validate the request body, ensuring `categoryId` is a valid UUID.

2.  **Implement Service Function**:
    -   Create a new file: `src/lib/services/merchant-mappings/updateMerchantMapping.ts`.
    -   Create an async function `updateMerchantMapping` that accepts `(supabase: SupabaseClient, id: string, command: UpdateMerchantMappingCommand)`.
    -   Inside the function, use `supabase.from('merchant_mappings').update({ category_id: command.categoryId }).eq('id', id).select().single()`.
    -   Check the result. If `error` is present and has code `PGRST116` (Not Found), or if `data` is null, throw a custom `NotFoundError`.
    -   Map the successful result to a `MerchantMappingDTO` and return it.

3.  **Create API Endpoint File**:
    -   Create a new file: `src/pages/api/merchant-mappings/[id].ts`.
    -   Add `export const prerender = false;`.

4.  **Implement `PATCH` Handler**:
    -   In `[id].ts`, export an `async function PATCH({ params, request, locals })`.
    -   Implement a `try...catch` block for error handling.
    -   Validate `params.id` is a UUID.
    -   Parse the JSON body from `request`.
    -   Validate the body using `updateMerchantMappingSchema.parse()`.
    -   Call `await updateMerchantMapping(locals.supabase, params.id, validatedBody)`.
    -   On success, return a `200 OK` JSON response with the result from the service.
    -   In the `catch` block, check for specific error types (e.g., Zod validation errors, `NotFoundError`) and return the corresponding `400` or `404` responses. Return a `500` for all other errors.

5.  **Add HTTP Tests**:
    -   In `api-testing/merchant-mappings.http`, add a test for the success path of the PATCH endpoint.
    -   Create a test case that updates an existing merchant mapping's category ID.
    -   Use the following format:
        ```
        ### Update merchant mapping category (success path - should return 200 OK)
        # Note: First create a merchant mapping using the POST tests above, then replace {id} with the actual ID
        PATCH {{baseUrl}}/api/merchant-mappings/{id}
        Content-Type: application/json
        Accept: application/json

        {
          "categoryId": "{{categoryId}}"
        }
        ```

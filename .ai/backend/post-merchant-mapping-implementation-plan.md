# API Endpoint Implementation Plan: POST /merchant-mappings

## 1. Endpoint Overview

This endpoint is responsible for creating a new merchant mapping or updating an existing one. It normalizes the provided `merchantName` to generate a `merchantKey` and performs an "upsert" operation in the database, keyed on the combination of the user's ID and the generated `merchantKey`. If a mapping for that key already exists for the user, its `categoryId` is updated; otherwise, a new mapping is created. This ensures that each normalized merchant name is uniquely mapped to a category for a given user.

## 2. Request Details

-   **HTTP Method**: `POST`
-   **URL Structure**: `/api/merchant-mappings`
-   **Parameters**: None
-   **Request Body**: The request body must be a JSON object with the following structure:
    ```json
    {
      "merchantName": "string",
      "categoryId": "string (uuid)"
    }
    ```

## 3. Used Types

-   **Command Model**: `UpsertMerchantMappingCommand` from `src/types.ts` will be used to type the validated request payload.
-   **Data Transfer Object**: `MerchantMappingDTO` from `src/types.ts` will be used to structure the successful response payload.

## 4. Response Details

-   **Success Response**:
    -   **Code**: `201 Created` if a new mapping is created.
    -   **Code**: `200 OK` if an existing mapping is updated.
    -   **Payload**: A JSON object representing the created or updated merchant mapping.
        ```json
        {
          "id": "string (uuid)",
          "merchantKey": "string",
          "categoryId": "string (uuid)",
          "updatedAt": "string (date-time)"
        }
        ```
-   **Error Response**: Refer to the Error Handling section for details on error responses.

## 5. Data Flow

1.  A client sends a `POST` request to `/api/merchant-mappings` with the `merchantName` and `categoryId` in the request body.
2.  The Astro endpoint handler located at `src/pages/api/merchant-mappings/index.ts` receives the request.
3.  The handler validates the request body against a Zod schema defined in `src/lib/validation/merchant-mappings.ts`.
4.  If validation succeeds, the handler invokes the `upsertMerchantMapping` service function, passing the Supabase client instance from `context.locals` and the validated command object.
5.  The `upsertMerchantMapping` service, located in `src/lib/services/merchant-mappings/`, executes the `upsert` operation on the `merchant_mappings` table using the Supabase client. The `merchantName` is normalized to `merchantKey` before the database call.
6.  The database performs an atomic `INSERT ... ON CONFLICT (user_id, merchant_key) DO UPDATE ...` operation, constrained by the user's ID via RLS.
7.  The database returns the newly created or updated row to the service layer.
8.  The service function maps the database record to a `MerchantMappingDTO` and returns it to the API handler.
9.  The API handler constructs the final JSON response, setting the HTTP status to `201` for creation or `200` for an update, and sends it back to the client.

## 6. Security Considerations

-   **Authentication**: The endpoint is protected by the Astro middleware, which ensures that only authenticated users with a valid session can access it.
-   **Authorization**: All database operations are automatically scoped to the authenticated user via Supabase's Row Level Security (RLS) policies. This prevents any user from accessing or modifying another user's data.
-   **Input Validation**: The Zod schema provides strict validation of the incoming payload, mitigating risks such as oversized data and type mismatches. The `merchantName` should be properly handled during normalization to prevent injection vulnerabilities.
-   **Data Integrity**: The foreign key constraint on `categoryId` ensures that mappings can only point to valid, existing categories, maintaining data integrity.

## 7. Error Handling

-   **400 Bad Request**:
    -   **Cause**: The request body is malformed, missing required fields, or contains incorrect data types.
    -   **Handling**: The Zod validation layer will catch these issues and the API will return a descriptive JSON error response.
    -   **Cause**: The provided `categoryId` does not correspond to an existing category.
    -   **Handling**: The database will reject the transaction due to a foreign key constraint violation. The service layer will catch this specific database error (Postgres error code `23503`) and return a structured error, which the API layer will translate into a 400 response.
-   **401 Unauthorized**:
    -   **Cause**: The request is made by a user without a valid session token.
    -   **Handling**: The Astro middleware will intercept the request and return a 401 status code before it reaches the endpoint handler.
-   **500 Internal Server Error**:
    -   **Cause**: An unexpected server-side issue occurs, such as a database connection failure.
    -   **Handling**: A global error handler will catch any unhandled exceptions, log the detailed error for debugging purposes, and return a generic 500 error response to the client.

## 8. Performance Considerations

-   **Database Indexing**: The unique composite index on `(user_id, merchant_key)` is critical for ensuring the high performance of the `upsert` operation. This index must be in place.
-   **Query Optimization**: The logic is encapsulated in a single `upsert` database query, which is highly efficient and avoids multiple round-trips between the application server and the database.

## 9. Implementation Steps

1.  **Define Zod Schema**:
    -   In `src/lib/validation/merchant-mappings.ts`, create and export a Zod schema to validate the `UpsertMerchantMappingCommand` payload. Ensure `merchantName` is a non-empty string and `categoryId` is a UUID string.
2.  **Implement Service Function**:
    -   Create the file `src/lib/services/merchant-mappings/upsertMerchantMapping.ts`.
    -   Define and export an async function `upsertMerchantMapping` that accepts a `SupabaseClient` instance and an `UpsertMerchantMappingCommand` object.
    -   This function will contain the logic to call the Supabase `.upsert()` method on the `merchant_mappings` table. It will first need to derive the `merchantKey` from the `merchantName` (e.g., by lowercasing and removing special characters).
    -   Implement error handling to catch potential database errors (especially foreign key violations) and return a consistent result object (e.g., `{ data, error }`).
3.  **Create API Endpoint Handler**:
    -   In `src/pages/api/merchant-mappings/index.ts`, implement the `POST` export function.
    -   Ensure `export const prerender = false;` is set.
    -   Validate the request body using the Zod schema.
    -   Call the `upsertMerchantMapping` service with the user's Supabase client (`context.locals.supabase`).
    -   Based on the service's response, return the appropriate HTTP status code (`200`/`201` on success) and JSON payload or a formatted error response.
4.  **Add API Test Case**:
    -   In the `api-testing/` directory, create or update a `.http` file to include test cases for the new `POST /merchant-mappings` endpoint.
    -   Include tests for successful creation, successful update, and expected failures (e.g., invalid UUID, missing fields).

# API Endpoint Implementation Plan: DELETE /merchant-mappings/{id}

## 1. Endpoint Overview
This document outlines the implementation plan for the `DELETE /api/merchant-mappings/{id}` endpoint. The purpose of this endpoint is to allow an authenticated user to permanently delete one of their own merchant mappings. This action removes the direct mapping rule, causing future transactions with the same merchant to fall back to the AI-based categorization model.

## 2. Request Details
- **HTTP Method**: `DELETE`
- **URL Structure**: `/api/merchant-mappings/{id}`
- **Parameters**:
  - **Required**:
    - `id` (Path Parameter): The UUID of the merchant mapping to be deleted.
- **Request Body**: _None_

## 3. Used Types
The implementation will use the following existing DTO for the success response, defined in `src/types.ts`:
- **`DeleteMerchantMappingResponse`**: Represents the successful deletion response payload.
  ```typescript
  export interface DeleteMerchantMappingResponse {
    id: MerchantMappingRow["id"];
    deleted: true;
  }
  ```

## 4. Response Details
- **Success Response**:
  - **Code**: `200 OK`
  - **Payload**: `DeleteMerchantMappingResponse`
  ```json
  {
    "id": "e7b2b2b2-b2b2-4b2b-b2b2-b2b2b2b2b2b2",
    "deleted": true
  }
  ```
- **Error Responses**:
  - **Code**: `400 Bad Request` - Returned if the `id` path parameter is not a valid UUID.
  - **Code**: `401 Unauthorized` - Returned if the request lacks a valid user session.
  - **Code**: `404 Not Found` - Returned if the mapping with the specified `id` does not exist or does not belong to the user.
  - **Code**: `500 Internal Server Error` - Returned for unexpected server-side issues.

## 5. Data Flow
1. A `DELETE` request is sent to the `/api/merchant-mappings/{id}` endpoint.
2. Astro's middleware intercepts the request to verify the user is authenticated. If not, it returns a `401 Unauthorized` error.
3. The API route handler in `src/pages/api/merchant-mappings/[id].ts` receives the request.
4. The handler extracts the `id` from the URL path parameters.
5. The `id` is validated using a Zod schema from `src/lib/validators/merchant-mappings.ts` to ensure it is a valid UUID. If validation fails, a `400 Bad Request` is returned.
6. The handler calls the `deleteMerchantMapping` service function from `src/lib/services/merchant-mappings/`, passing the Supabase client instance, the validated `id`, and the `user.id` from the session.
7. The `deleteMerchantMapping` service executes a `DELETE` query against the `public.merchant_mappings` table with a `WHERE` clause matching both `id` and `user_id`.
8. If the database query affects zero rows, the service throws a "Not Found" error, which the handler catches and translates into a `404 Not Found` response.
9. If the query succeeds, the service returns the deleted `id`.
10. The handler constructs the `DeleteMerchantMappingResponse` payload and sends it back to the client with a `200 OK` status.

## 6. Security Considerations
- **Authentication**: Access to the endpoint will be restricted to authenticated users only, enforced by the existing Astro middleware that checks for a valid Supabase session.
- **Authorization**: Ownership is strictly enforced at the database level. The `deleteMerchantMapping` service must include the `user_id` in the `WHERE` clause of the `DELETE` query to prevent a user from deleting another user's mappings (mitigating IDOR vulnerabilities).
- **Input Validation**: The `id` path parameter will be rigorously validated as a UUID to prevent malformed database queries and potential injection attacks.

## 7. Performance Considerations
The `DELETE` operation targets a record by its primary key (`id`). The query will be highly performant as it will leverage the primary key index on the `merchant_mappings` table. No significant performance bottlenecks are anticipated for this endpoint.

## 8. Implementation Steps
1.  **Create Validator**:
    - In `src/lib/validators/merchant-mappings.ts`, add a Zod schema to validate that a given string is a valid UUID for the path parameter.

2.  **Create Service Function**:
    - Create a new file: `src/lib/services/merchant-mappings/deleteMerchantMapping.ts`.
    - Implement an async function `deleteMerchantMapping(supabase: SupabaseClient, id: string, userId: string): Promise<string>`.
    - This function will execute the database deletion and handle the case where the mapping is not found by throwing an error.

3.  **Update Service Index**:
    - Export the `deleteMerchantMapping` function from the service's barrel file, `src/lib/services/merchant-mappings/index.ts`.

4.  **Implement API Route**:
    - In the file `src/pages/api/merchant-mappings/[id].ts`, add a `DELETE` handler function.
    - The handler will perform the following actions:
        - Get the user session and Supabase client from `context.locals`.
        - Extract and validate the `id` from `context.params`.
        - Call the `deleteMerchantMapping` service.
        - Handle any errors thrown by the service and return the appropriate HTTP responses.
        - On success, return a `200 OK` response with the `DeleteMerchantMappingResponse` payload.
        - Ensure `export const prerender = false` is set.

5.  **Create API Tests**:
    - In the `api-testing/merchant-mappings.http` file, add test cases for the `DELETE` endpoint.
    - Include tests for:
      - Successful deletion (`200 OK`).
      - Attempting to delete a non-existent mapping (`404 Not Found`).
      - Attempting to delete with an invalid UUID (`400 Bad Request`).
      - Attempting to delete without authentication (`401 Unauthorized`).

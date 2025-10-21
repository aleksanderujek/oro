# API Endpoint Implementation Plan: GET /dashboard

## 1. Endpoint Overview
This document outlines the implementation plan for the `GET /dashboard` REST API endpoint. The endpoint provides aggregated expense metrics for an authenticated user's selected month. It calculates the total expenses, month-over-month (MoM) change, a daily spending breakdown, and a summary of top spending categories. The data can be filtered by account type and a specific list of categories.

## 2. Request Details
- **HTTP Method**: `GET`
- **URL Structure**: `/api/dashboard`
- **Query Parameters**:
  - **Optional**:
    - `month` (string): The month for which to retrieve data, in `YYYY-MM` format. If omitted, it defaults to the current month based on the user's timezone.
    - `account` (enum: `cash` | `card` | `all`): Filters expenses by the specified account type. If omitted, all accounts are included.
    - `categoryIds` (string): A comma-separated list of category UUIDs to filter the results. If omitted, all categories are included.
- **Request Body**: None.

## 3. Used Types
The implementation will use the following existing DTOs from `src/types.ts`:
- `DashboardResponse`
- `DashboardDailyTotalDTO`
- `DashboardTopCategoryDTO`
- `CurrencyAmount` (from `ExpenseRow["amount"]`)

A new command model/options object will be defined to pass validated query parameters to the service layer:
- `GetDashboardOptions`:
  - `month`: string (e.g., "2025-10")
  - `timezone`: string (IANA format, e.g., "Europe/Warsaw")
  - `account?`: `AccountType`
  - `categoryIds?`: string[]

## 4. Response Details
- **Success Response (200 OK)**:
  - **Content-Type**: `application/json`
  - **Body**: A JSON object conforming to the `DashboardResponse` DTO.
  ```json
  {
    "month": "2025-02",
    "timezone": "Europe/Warsaw",
    "total": 1240.56,
    "monthOverMonth": {
      "absolute": 120.1,
      "percent": 10.7
    },
    "daily": [
      { "date": "2025-02-01", "total": 45.1 },
      { "date": "2025-02-02", "total": 0 }
    ],
    "topCategories": [
      { "categoryId": "uuid", "name": "Groceries", "total": 320.5, "percentage": 25.8 }
    ]
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: When query parameters are invalid.
  - `401 Unauthorized`: When the user is not authenticated.
  - `500 Internal Server Error`: For unexpected server-side failures.

## 5. Data Flow
1.  **API Route (`/pages/api/dashboard.ts`)**:
    - Receives the `GET` request.
    - Authenticates the user via `context.locals.supabase`. If no user, returns `401`.
    - Validates query parameters (`month`, `account`, `categoryIds`) using a Zod schema. If invalid, returns `400`.
    - Fetches the user's profile using a service function to retrieve their timezone. This is needed to determine the default month if not provided.
    - Calls the `getDashboardData` service with the validated options.
    - Catches any errors from the service layer and returns a `500` response.
    - On success, returns a `200 OK` response with the `DashboardResponse` payload.

2.  **Dashboard Service (`/lib/services/dashboard/getDashboardData.ts`)**:
    - Receives the options object from the API route.
    - Calculates the start and end `timestamptz` for the target month and the previous month based on the provided `month` and `timezone`.
    - Invokes a new Supabase RPC (database function) named `get_dashboard_metrics`. This function will perform all the heavy lifting of aggregation to minimize data transfer and latency.
    - The RPC will accept `user_id`, date ranges, and optional filters (`account`, `category_ids`) as arguments. It will return the aggregated totals, daily breakdown, and category breakdown.
    - The service processes the RPC result, calculating the MoM percentage (handling division-by-zero) and category percentages.
    - It maps the processed data into the `DashboardResponse` DTO and returns it.

## 6. Security Considerations
- **Authentication**: The endpoint is protected and requires a valid user session. The Astro middleware and Supabase client will handle session verification.
- **Authorization**: Data access is restricted at the database level via Supabase's Row Level Security (RLS) policies on the `expenses` table, ensuring users can only query their own data. The `user_id` from the authenticated session will be passed to all database queries.
- **Input Validation**: All query parameters will be strictly validated with Zod to prevent invalid data from reaching the service layer. A limit will be placed on the number of `categoryIds` (e.g., 50) to mitigate potential performance abuse.

## 7. Error Handling
- **400 Bad Request**: Returned if Zod validation of query parameters fails. The response body will include an `error` field detailing the validation issues.
- **401 Unauthorized**: Returned by the middleware if no valid session is found.
- **500 Internal Server Error**: Returned for any unhandled exceptions in the service or database layer. Errors will be logged to the server console with relevant context (user ID, params) for debugging.

## 8. Performance Considerations
- **Database Optimization**: The core logic will be implemented as a single PostgreSQL function (`get_dashboard_metrics`) and exposed via Supabase RPC. This minimizes round-trips between the application server and the database and leverages the database's efficiency for data aggregation.
- **Indexing**: The existing index on `(user_id, occurred_at DESC, amount DESC, id DESC)` on the `expenses` table will be utilized for efficient filtering and sorting. Additional partial indexes on `account` or `category_id` may be considered if performance analysis indicates they are necessary.

## 9. Implementation Steps
1.  **Database Migration**:
    - Create a new SQL migration file.
    - Define a new PostgreSQL function `get_dashboard_metrics(p_user_id, p_start_date, p_end_date, p_prev_start_date, p_prev_end_date, p_account, p_category_ids)`.
    - This function will perform all necessary aggregations (total, previous month total, daily totals, category totals) on the `expenses` table and return a structured result.
2.  **API Route Creation**:
    - Create a new file: `src/pages/api/dashboard.ts`.
    - Implement the `GET` handler.
    - Add logic to extract and validate query parameters using Zod.
3.  **Service Layer Development**:
    - Create a new service file: `src/lib/services/dashboard/getDashboardData.ts`.
    - Implement the `getDashboardData` function which takes the `GetDashboardOptions` object.
    - This function will handle date calculations based on the user's timezone and call the `get_dashboard_metrics` Supabase RPC.
    - Add logic to calculate MoM and category percentages from the RPC result.
    - Map the final data to the `DashboardResponse` DTO.
4.  **Profile Service Update (if needed)**:
    - Ensure a method exists in the profile service (`src/lib/services/profiles/`) to fetch the current user's profile to retrieve their timezone.
5.  **Integration**:
    - Wire the API route to call the new dashboard service.
    - Add comprehensive error handling and logging.
6.  **Testing**:
    - Create a new HTTP test file in `/api-testing/dashboard.http` to test various scenarios:
      - No parameters (default to current month).
      - With `month` parameter.
      - With `account` filter.
      - With `categoryIds` filter.
      - With combined filters.
      - Invalid parameters (e.g., bad month format).
      - Unauthenticated request.

# API Endpoint Implementation Plan: Get Expense by ID

## 1. Endpoint Overview

This endpoint retrieves a single expense record by its unique identifier. It provides detailed information about a specific expense, including amount, name, description, category, account type, and timestamps. The endpoint enforces user ownership validation to ensure users can only access their own expense records.

**Key Features:**

- Fetch individual expense by UUID
- User-owned resource validation
- Support for soft-deleted expense filtering
- Consistent error handling with other expense endpoints

## 2. Request Details

- **HTTP Method**: `GET`
- **URL Structure**: `/api/expenses/{id}`
- **Parameters**:
  - **Required Path Parameters**:
    - `id` (string): UUID of the expense to retrieve
  - **Optional Parameters**: None
  - **Query Parameters**: None
- **Request Headers**:
  - `Authorization`: Required (handled by Astro middleware/Supabase)
  - `X-Request-Id`: Optional (for request tracing)
- **Request Body**: None

**Path Parameter Validation:**

- `id` must be a valid UUID v4 format
- Invalid UUID format should return 400 Bad Request

## 3. Used Types

### Response Types

```typescript
// From src/types.ts
export type ExpenseDetailsResponse = ExpenseDTO;

export interface ExpenseDTO {
  id: string; // UUID
  amount: number; // Real number > 0
  name: string; // Max 64 chars
  description: string | null; // Max 200 chars, nullable
  occurredAt: string; // ISO 8601 UTC timestamp
  account: AccountType | null; // 'cash' | 'card' | null
  categoryId: string; // UUID
  deleted: boolean; // Computed from deleted_at
  deletedAt: string | null; // ISO 8601 timestamp or null
  createdAt: string; // ISO 8601 timestamp
  updatedAt: string; // ISO 8601 timestamp
}
```

### Validator Schema

```typescript
// Add to src/lib/validators/expenses.ts
export const ExpenseIdSchema = z
  .string({
    required_error: "expense ID is required",
    invalid_type_error: "expense ID must be a string",
  })
  .uuid("expense ID must be a valid UUID");
```

### Service Types

```typescript
// New service: src/lib/services/expenses/getExpenseById.ts
export type GetExpenseByIdErrorCode = "EXPENSE_NOT_FOUND" | "EXPENSE_QUERY_FAILED" | "UNAUTHORIZED_ACCESS";

export class GetExpenseByIdError extends Error {
  public readonly code: GetExpenseByIdErrorCode;

  constructor(code: GetExpenseByIdErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "GetExpenseByIdError";
    this.code = code;
    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}

interface GetExpenseByIdParams {
  supabase: SupabaseClient;
  userId: string;
  expenseId: string;
  requestId?: string;
}
```

## 4. Response Details

### Success Response (200 OK)

```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "amount": 42.5,
  "name": "Grocery Store",
  "description": "Weekly groceries",
  "occurredAt": "2024-10-19T12:30:00.000Z",
  "account": "card",
  "categoryId": "987fcdeb-51a2-43f1-b9c4-123456789abc",
  "deleted": false,
  "deletedAt": null,
  "createdAt": "2024-10-19T12:35:00.000Z",
  "updatedAt": "2024-10-19T12:35:00.000Z"
}
```

### Error Responses

**400 Bad Request** - Invalid UUID format:

```json
{
  "code": "INVALID_EXPENSE_ID",
  "message": "expense ID must be a valid UUID"
}
```

**401 Unauthorized** - Missing or invalid authentication:

```json
{
  "code": "UNAUTHORIZED",
  "message": "Authentication required"
}
```

**403 Forbidden** - Expense belongs to another user:

```json
{
  "code": "UNAUTHORIZED_ACCESS",
  "message": "You do not have permission to access this expense"
}
```

**404 Not Found** - Expense does not exist:

```json
{
  "code": "EXPENSE_NOT_FOUND",
  "message": "Expense not found"
}
```

**500 Internal Server Error** - Database or system error:

```json
{
  "code": "EXPENSE_QUERY_FAILED",
  "message": "Unable to retrieve expense"
}
```

## 5. Data Flow

### High-Level Flow

1. **Request Reception**: Astro API route receives GET request with expense ID in path
2. **Authentication Check**: Middleware validates user session (via Supabase)
3. **Parameter Extraction**: Extract and validate expense ID from URL path
4. **Input Validation**: Validate expense ID is a valid UUID format
5. **Service Invocation**: Call `getExpenseById` service with validated parameters
6. **Database Query**: Query `expenses` table with ID and user_id filters
7. **Authorization Check**: Verify expense belongs to authenticated user (implicit via query)
8. **Response Mapping**: Transform database row to ExpenseDTO format
9. **Response Return**: Return 200 with expense data or appropriate error

### Database Query Flow

```sql
-- Simplified query representation
SELECT
  id, amount, name, description,
  occurred_at, account, category_id,
  deleted, deleted_at, created_at, updated_at
FROM public.expenses
WHERE id = $1
  AND user_id = $2
  AND deleted = false  -- Only return non-deleted expenses
LIMIT 1;
```

**Query Strategy:**

- Use `.eq('id', expenseId)` and `.eq('user_id', userId)` filters
- Use `.eq('deleted', false)` to exclude soft-deleted expenses
- Use `.maybeSingle()` to handle 0 or 1 result (vs `.single()` which errors on 0 results)
- Select only necessary columns (exclude `merchant_key`, `search_text`, `user_id`)

### Service Implementation Pattern

```typescript
export async function getExpenseById({
  supabase,
  userId,
  expenseId,
  requestId,
}: GetExpenseByIdParams): Promise<ExpenseDetailsResponse> {
  // Query with authorization built-in
  const { data, error } = await supabase
    .from("expenses")
    .select(
      "id, amount, name, description, occurred_at, account, category_id, deleted, deleted_at, created_at, updated_at"
    )
    .eq("id", expenseId)
    .eq("user_id", userId)
    .eq("deleted", false)
    .maybeSingle<ExpenseRow>();

  // Handle database errors
  if (error) {
    throw new GetExpenseByIdError("EXPENSE_QUERY_FAILED", "Unable to retrieve expense", {
      cause: { error, expenseId, userId, requestId },
    });
  }

  // Handle not found (includes authorization failure)
  if (!data) {
    throw new GetExpenseByIdError("EXPENSE_NOT_FOUND", "Expense not found", {
      cause: { expenseId, userId, requestId },
    });
  }

  // Map to DTO
  return toExpenseDTO(data);
}
```

## 6. Security Considerations

### Authentication

- **Requirement**: User must have valid Supabase session
- **Implementation**: Astro middleware (`src/middleware/index.ts`) validates session
- **Failure Response**: 401 Unauthorized if `locals.session` is null/undefined
- **Session Source**: `context.locals.session` injected by middleware

### Authorization

- **Requirement**: User can only access their own expenses
- **Implementation**: Database query includes `user_id` filter matching authenticated user
- **Strategy**: Implicit authorization via query (no separate check needed)
- **Failure Response**: 404 Not Found (same as non-existent expense for security)
  - **Rationale**: Prevents information leakage about existence of other users' expenses
  - **Alternative**: Could return 403 Forbidden, but 404 is more secure

### Input Validation

- **UUID Validation**: Ensure expense ID matches UUID v4 format before query
- **Protection Against**: SQL injection (via parameterized queries), invalid input
- **Validation Layer**: Zod schema validation in API route handler
- **Early Return**: Reject invalid UUIDs with 400 before database query

### Data Exposure Prevention

- **Column Selection**: Exclude internal columns (`merchant_key`, `search_text`, `user_id`)
- **Soft Delete Handling**: Exclude soft-deleted expenses from results
- **Error Messages**: Avoid leaking sensitive information in error responses

### Rate Limiting Considerations

- **Recommendation**: Implement rate limiting at infrastructure level (Cloudflare)
- **Endpoint Risk**: Low-medium (read operation, user-scoped)
- **Pattern**: Limit by user ID and IP address

## 7. Error Handling

### Error Hierarchy

1. **Infrastructure Errors** (500)
   - Supabase client not available
   - Database connection failures
   - Unexpected system errors

2. **Authentication Errors** (401)
   - Missing session
   - Expired session
   - Invalid authentication token

3. **Authorization Errors** (403 or 404)
   - Expense belongs to different user
   - User lacks permission to access resource
   - **Decision**: Use 404 to prevent information leakage

4. **Validation Errors** (400)
   - Invalid UUID format
   - Malformed request parameters

5. **Not Found Errors** (404)
   - Expense ID does not exist
   - Expense is soft-deleted

### Error Handling Flow

```typescript
// In API route handler
try {
  // 1. Validate expense ID format
  const expenseId = ExpenseIdSchema.parse(id);

  // 2. Call service
  const expense = await getExpenseById({
    supabase,
    userId: session.user.id,
    expenseId,
    requestId,
  });

  // 3. Return success response
  return buildJsonResponse(expense, 200, requestId);
} catch (error) {
  // Handle Zod validation errors
  if (error instanceof ZodError) {
    return buildValidationErrorResponse(error, {
      requestId,
      defaultMessage: "Invalid expense ID",
      code: "INVALID_EXPENSE_ID",
    });
  }

  // Handle service errors
  if (error instanceof GetExpenseByIdError) {
    switch (error.code) {
      case "EXPENSE_NOT_FOUND":
      case "UNAUTHORIZED_ACCESS":
        // Return 404 for both (security consideration)
        return buildErrorResponse(404, { code: "EXPENSE_NOT_FOUND", message: "Expense not found" }, requestId);

      case "EXPENSE_QUERY_FAILED":
        return buildErrorResponse(500, { code: error.code, message: "Unable to retrieve expense" }, requestId);

      default:
        return buildErrorResponse(500, { code: "UNKNOWN_ERROR", message: "Unable to retrieve expense" }, requestId);
    }
  }

  // Handle unexpected errors
  return buildErrorResponse(500, { code: "UNKNOWN_ERROR", message: "Unable to retrieve expense" }, requestId);
}
```

### Error Logging

- **Console Logging**: Log error details with `console.error()` for debugging
- **Structured Logging**: Include requestId, userId, expenseId in error context
- **Error Cause Chain**: Use `cause` property to preserve original error information
- **Production Considerations**: Consider integrating with error tracking service (e.g., Sentry)

## 8. Performance Considerations

### Database Query Optimization

- **Indexed Columns**: Ensure `id` (primary key) and `user_id` are indexed
- **Column Selection**: Select only required columns (avoid `SELECT *`)
- **Query Complexity**: O(1) lookup via primary key index
- **Expected Latency**: <50ms for query execution

### Connection Pooling

- **Supabase Client**: Uses connection pooling by default
- **Stateless Operations**: No need for transaction management
- **Resource Cleanup**: Automatic via Supabase client

### Caching Strategies

- **Client-Side**: Enable browser caching with appropriate Cache-Control headers
- **Recommendation**: `Cache-Control: private, max-age=60` (1 minute)
- **CDN Caching**: Not recommended (private user data)
- **ETag Support**: Consider implementing for conditional requests

### Monitoring Metrics

- **Response Time**: Track p50, p95, p99 latencies
- **Error Rate**: Monitor 4xx and 5xx responses
- **Database Performance**: Track query execution time
- **Success Rate**: Monitor successful vs failed requests

## 9. Implementation Steps

### Step 1: Create Validation Schema

**File**: `src/lib/validators/expenses.ts`

Add UUID validation schema:

```typescript
export const ExpenseIdSchema = z
  .string({
    required_error: "expense ID is required",
    invalid_type_error: "expense ID must be a string",
  })
  .uuid("expense ID must be a valid UUID");

export function validateExpenseId(input: unknown): string {
  return ExpenseIdSchema.parse(input);
}
```

### Step 2: Create Service Implementation

**File**: `src/lib/services/expenses/getExpenseById.ts`

Implement the service with:

- Error class definition (`GetExpenseByIdError`)
- Parameter interface (`GetExpenseByIdParams`)
- Main service function (`getExpenseById`)
- DTO mapper (reuse `toExpenseDTO` from `getExpenses.ts` or create shared utility)

**Key Implementation Details:**

- Use `.maybeSingle()` instead of `.single()` for graceful not-found handling
- Filter by `user_id` AND `id` for implicit authorization
- Exclude soft-deleted expenses with `.eq('deleted', false)`
- Select only necessary columns
- Include comprehensive error context with `cause` property

### Step 3: Create API Route Handler

**File**: `src/pages/api/expenses/[id].ts`

Create new file with GET handler:

```typescript
export const prerender = false;

export const GET: APIRoute = async ({ params, locals, request }) => {
  const requestId = getRequestId(request);
  const supabase = locals.supabase;
  const session = locals.session;

  // 1. Check Supabase availability
  // 2. Check authentication
  // 3. Extract and validate expense ID from params
  // 4. Call service
  // 5. Handle errors
  // 6. Return response
};
```

**Route Pattern**: Use Astro's dynamic route syntax `[id].ts`

**Parameter Extraction**: `const { id } = params;`

### Step 4: Update Export Index (Optional)

**File**: `src/lib/services/expenses/index.ts`

If exists, add export for new service:

```typescript
export * from "./getExpenseById";
```

### Step 5: Add Validation Error Response Helper (If Needed)

**File**: `src/lib/http/validation.ts`

Ensure `buildValidationErrorResponse` exists and handles Zod errors appropriately.

### Step 6: Testing Preparation

Create HTTP test file for manual testing:
**File**: `api-testing/expense-by-id.http`

```http
### Get expense by ID - Success
GET {{baseUrl}}/api/expenses/{{validExpenseId}}
Authorization: Bearer {{authToken}}

### Get expense by ID - Not Found
GET {{baseUrl}}/api/expenses/00000000-0000-0000-0000-000000000000
Authorization: Bearer {{authToken}}

### Get expense by ID - Invalid UUID
GET {{baseUrl}}/api/expenses/invalid-uuid
Authorization: Bearer {{authToken}}

### Get expense by ID - Unauthorized
GET {{baseUrl}}/api/expenses/{{validExpenseId}}
# No Authorization header
```

### Step 7: Integration Points

**Update TypeScript types** (if needed):

- Verify `ExpenseDetailsResponse` type exists in `src/types.ts` (already exists)

### Step 8: Code Review Checklist

Before marking implementation complete, verify:

- [ ] Input validation covers all edge cases
- [ ] Error handling is comprehensive
- [ ] Security: Authentication check implemented
- [ ] Security: Authorization (user_id filter) implemented
- [ ] Security: No information leakage in error messages
- [ ] Service follows existing patterns (`getExpenses.ts`, `createExpense.ts`)
- [ ] Database query is optimized (indexed columns, minimal selection)
- [ ] Error responses match status code conventions
- [ ] Type safety maintained throughout
- [ ] Request ID propagated for tracing
- [ ] Soft-deleted expenses excluded from results
- [ ] Code follows project coding practices (early returns, guard clauses)
- [ ] Linter passes without errors

---

## Notes

- **Consistency**: This endpoint follows the same patterns as existing expense endpoints
- **Security-First**: Authorization is implicit via database query, preventing unauthorized access
- **Error Strategy**: Returns 404 for both non-existent and unauthorized access to prevent information leakage
- **Type Safety**: Leverages existing types from `src/types.ts`
- **Soft Deletes**: Respects soft delete pattern by excluding `deleted = true` expenses
- **Testing**: Can be tested using existing HTTP test files pattern
- **Future Enhancements**: Consider adding support for `includeDeleted` query parameter if needed for admin views

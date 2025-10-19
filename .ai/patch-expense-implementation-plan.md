# API Endpoint Implementation Plan: PATCH `/expenses/{id}`

## 1. Endpoint Overview

The PATCH `/expenses/{id}` endpoint allows authenticated users to update editable fields of an existing expense. This endpoint implements partial update semantics, requiring at least one field to be provided while maintaining data integrity and authorization controls.

**Key Characteristics:**
- Supports partial updates (at least one field required)
- Preserves soft-delete flag (does not restore deleted expenses)
- Validates ownership before allowing updates
- Maintains referential integrity with categories
- Updates `updated_at` timestamp automatically

## 2. Request Details

### HTTP Method
PATCH

### URL Structure
```
/api/expenses/{id}
```

### Path Parameters
- **id** (required): UUID of the expense to update

### Query Parameters
None

### Request Headers
- `Content-Type: application/json` (required)
- `X-Request-Id: <request-id>` (optional, for tracing)
- Authentication cookies (managed by Supabase middleware)

### Request Body
JSON object conforming to `UpdateExpenseCommand` type. At least one field must be provided:

```json
{
  "amount": 29.99,
  "name": "Coffee Shop",
  "description": "Two lattes",
  "occurredAt": "2025-02-15T08:45:00Z",
  "categoryId": "uuid",
  "account": "card"
}
```

**Field Specifications:**
- `amount` (optional): Positive number with max 2 decimal places
- `name` (optional): String, max 64 characters, trimmed, non-empty after whitespace normalization
- `description` (optional): String, max 200 characters, trimmed, can be explicitly set to `null` to clear
- `occurredAt` (optional): ISO 8601 UTC timestamp ending with 'Z'
- `categoryId` (optional): Valid UUID referencing an existing category
- `account` (optional): Enum value ("cash" or "card")

## 3. Used Types

### DTOs
- **ExpenseDTO**: Response object containing all expense fields
- **ExpenseDetailsResponse**: Alias for ExpenseDTO (used for consistency with GET endpoint)

### Command Models
- **UpdateExpenseCommand**: Input type requiring at least one field from ExpenseEditableFields

### Internal Types
- **ExpenseRow**: Database row type from Supabase-generated types
- **TablesUpdate<"expenses">**: Supabase update payload type

### Validation Types
- **UpdateExpenseInput**: Inferred from UpdateExpenseSchema (Zod schema)

## 4. Response Details

### Success Response (200 OK)

**Headers:**
- `Content-Type: application/json`
- `X-Request-Id: <request-id>` (if provided in request)

**Body:**
```json
{
  "id": "uuid",
  "amount": 29.99,
  "name": "Coffee Shop",
  "description": "Two lattes",
  "occurredAt": "2025-02-15T08:45:00Z",
  "account": "card",
  "categoryId": "uuid",
  "deleted": false,
  "deletedAt": null,
  "createdAt": "2025-01-01T10:00:00Z",
  "updatedAt": "2025-02-15T10:30:00Z"
}
```

### Error Responses

#### 400 Bad Request
Returned when input validation fails.

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Invalid request body",
  "errors": [
    {
      "path": ["amount"],
      "message": "amount must be greater than zero"
    }
  ]
}
```

**Validation Error Scenarios:**
- Invalid or missing expense ID in path
- No fields provided in request body
- Invalid UUID format for `id` or `categoryId`
- `amount` ≤ 0 or has more than 2 decimal places
- `name` empty after trimming or exceeds 64 characters
- `description` exceeds 200 characters
- `occurredAt` not a valid ISO UTC timestamp
- `account` not in allowed enum values
- Unknown fields in request body (strict validation)

#### 401 Unauthorized
Returned when user is not authenticated.

```json
{
  "code": "UNAUTHORIZED",
  "message": "Authentication required"
}
```

#### 403 Forbidden
Returned when user attempts to update an expense they don't own. **Note:** For security reasons, this is typically masked as 404 to prevent information leakage.

#### 404 Not Found
Returned when expense doesn't exist, is soft-deleted, or user lacks ownership.

```json
{
  "code": "EXPENSE_NOT_FOUND",
  "message": "Expense not found"
}
```

**404 Scenarios:**
- Expense ID doesn't exist in database
- Expense exists but belongs to different user (security: prevents enumeration)
- Expense is soft-deleted (preserves soft-delete flag as per spec)

#### 500 Internal Server Error
Returned for unexpected server errors.

```json
{
  "code": "EXPENSE_UPDATE_FAILED",
  "message": "Unable to update expense"
}
```

**500 Scenarios:**
- Supabase client unavailable
- Database connection failures
- Unexpected exceptions in service layer

## 5. Data Flow

### Request Processing Pipeline

```
1. Incoming Request
   └─> Astro Middleware (authentication check)
       └─> Route Handler (PATCH handler)
           ├─> Validate Supabase availability
           ├─> Validate authentication (session check)
           ├─> Extract and validate expense ID from path params
           ├─> Parse and validate request body
           └─> Call service layer
               └─> updateExpense service
                   ├─> Verify expense exists and belongs to user
                   ├─> Validate category exists (if categoryId provided)
                   ├─> Build update payload
                   ├─> Execute database update
                   └─> Return updated expense DTO
```

### Database Operations

1. **Authorization Check**: Query expense with `user_id` filter to verify ownership and existence
2. **Category Validation** (if `categoryId` provided): Verify category exists
3. **Update Operation**: Execute UPDATE with optimized column selection
4. **Fetch Updated Row**: Return complete expense data for response

### Service Layer Architecture

**File:** `src/lib/services/expenses/updateExpense.ts`

**Function Signature:**
```typescript
async function updateExpense({
  supabase: SupabaseClient,
  userId: string,
  expenseId: string,
  input: UpdateExpenseCommand,
  requestId?: string
}): Promise<ExpenseDTO>
```

**Service Responsibilities:**
- Fetch existing expense with ownership verification
- Validate category existence (if categoryId changed)
- Transform command to database payload
- Execute update with row-level security
- Map database row to DTO
- Throw typed errors for various failure scenarios

## 6. Security Considerations

### Authentication
- **Method**: Session-based authentication via Supabase Auth
- **Check Location**: Astro middleware + explicit session validation in route handler
- **Failure Response**: 401 Unauthorized

### Authorization
- **Row-Level Security**: All expense queries include `user_id` filter matching authenticated user
- **Ownership Verification**: Service layer fetches expense with `eq("user_id", userId)` clause
- **Security by Obscurity**: Return 404 (not 403) when user lacks ownership to prevent expense ID enumeration

### Input Validation
- **Schema Validation**: Zod schema with strict mode (rejects unknown fields)
- **Whitespace Normalization**: Trim and collapse whitespace in `name` and `description`
- **SQL Injection Prevention**: Parameterized queries via Supabase client
- **XSS Prevention**: No HTML rendering in API; client responsible for output encoding
- **Type Coercion**: Explicit type validation prevents type confusion attacks

### Data Integrity
- **Foreign Key Validation**: Verify `categoryId` exists before update
- **Immutable Fields**: `user_id`, `id`, `created_at` cannot be modified
- **Soft-Delete Preservation**: Update does not modify `deleted` or `deleted_at` fields
- **Generated Columns**: `merchant_key`, `search_text`, `deleted` auto-updated by database

### Rate Limiting
- **Recommendation**: Implement rate limiting at reverse proxy level (Cloudflare)
- **Scope**: Per-user, per-endpoint limits
- **Not Implemented**: Application-level rate limiting (defer to infrastructure)

### CORS and Headers
- **Content-Type Validation**: Ensure `application/json`
- **Request ID Propagation**: Support `X-Request-Id` header for tracing
- **CORS**: Configured at Astro level (same-origin by default)

## 7. Error Handling

### Validation Errors (400)

**Handler Location**: Route handler
**Error Source**: Zod validation failure

**Implementation:**
```typescript
try {
  input = validateUpdateExpenseCommand(await request.json());
} catch (error) {
  return buildValidationErrorResponse(error, {
    requestId,
    defaultMessage: "Invalid request body",
    code: "VALIDATION_ERROR"
  });
}
```

**Response Format:**
```json
{
  "code": "VALIDATION_ERROR",
  "message": "Invalid request body",
  "errors": [
    { "path": ["field"], "message": "specific error" }
  ]
}
```

### Service Layer Errors

**Error Class:** `UpdateExpenseError`

**Error Codes:**
- `EXPENSE_NOT_FOUND`: Expense doesn't exist or user lacks ownership
- `EXPENSE_QUERY_FAILED`: Database error when fetching expense
- `CATEGORY_NOT_FOUND`: Provided categoryId doesn't exist
- `CATEGORY_LOOKUP_FAILED`: Database error when validating category
- `EXPENSE_UPDATE_FAILED`: Database error during update operation

**Error Handling in Route Handler:**
```typescript
catch (error) {
  if (error instanceof UpdateExpenseError) {
    switch (error.code) {
      case "EXPENSE_NOT_FOUND":
        return buildErrorResponse(404, { 
          code: "EXPENSE_NOT_FOUND", 
          message: "Expense not found" 
        }, requestId);
      
      case "CATEGORY_NOT_FOUND":
        return buildErrorResponse(400, { 
          code: "CATEGORY_NOT_FOUND", 
          message: "Category does not exist" 
        }, requestId);
      
      case "EXPENSE_QUERY_FAILED":
      case "CATEGORY_LOOKUP_FAILED":
      case "EXPENSE_UPDATE_FAILED":
        return buildErrorResponse(500, { 
          code: error.code, 
          message: "Unable to update expense" 
        }, requestId);
    }
  }
  
  // Unexpected errors
  return buildErrorResponse(500, { 
    code: "UNKNOWN_ERROR", 
    message: "Unable to update expense" 
  }, requestId);
}
```

### Error Logging

**Logging Strategy:**
- **Validation Errors**: Log at DEBUG level (expected user errors)
- **Authorization Failures**: Log at INFO level with user ID and expense ID
- **Database Errors**: Log at ERROR level with full context and stack trace
- **Unexpected Errors**: Log at ERROR level with request ID for correlation

**Logging Implementation:**
- Use error `cause` field to attach contextual information
- Include `requestId` in all log entries for distributed tracing
- Avoid logging sensitive data (amounts, descriptions)

## 8. Performance Considerations

### Database Query Optimization

**Primary Concern**: Single expense update should complete in < 50ms (p95)

**Optimizations:**
1. **Indexed Lookups**: Primary key index on `expenses.id` ensures O(1) fetch
2. **Minimal Column Selection**: Only select needed columns in verification query
3. **Single Round-Trip Update**: Use `.update().select().single()` pattern
4. **Foreign Key Cache**: Consider caching valid category IDs at application level (future)

### Payload Size
- **Request**: < 1KB (constrained by field length limits)
- **Response**: ~500 bytes (single expense DTO)
- **No Pagination**: Single resource endpoint

### Caching Strategy
- **Not Applicable**: PATCH is non-idempotent and modifies state
- **Cache Invalidation**: Client should invalidate cached GET responses after successful PATCH

### Concurrency
- **Current Implementation**: Last-write-wins (no optimistic locking)
- **Future Enhancement**: Add `version` or `updated_at` check for 409 Conflict
- **Database Locking**: Rely on PostgreSQL row-level locks (automatic)

### Connection Pooling
- **Managed by**: Supabase client SDK
- **Default Settings**: Use Supabase defaults (no custom tuning needed)

## 9. Implementation Steps

### Step 1: Create Update Expense Validator

**File:** `src/lib/validators/expenses.ts`

**Tasks:**
1. Define `UpdateExpenseSchema` using Zod
2. Make all fields optional (leveraging existing field validators from `CreateExpenseSchema`)
3. Add `.refine()` to ensure at least one field is provided
4. Handle `description: null` for explicit clearing
5. Enable strict mode to reject unknown fields
6. Export `validateUpdateExpenseCommand()` function

**Example Schema Structure:**
```typescript
export const UpdateExpenseSchema = z
  .object({
    amount: /* reuse from CreateExpenseSchema */.optional(),
    name: /* reuse from CreateExpenseSchema */.optional(),
    description: /* reuse from CreateExpenseSchema */.optional().nullable(),
    occurredAt: /* reuse from CreateExpenseSchema */.optional(),
    categoryId: z.string().uuid().optional(),
    account: z.enum(ACCOUNT_TYPES).optional(),
  })
  .strict()
  .refine(
    (data) => Object.keys(data).length > 0,
    { message: "At least one field must be provided" }
  );
```

### Step 2: Create Update Expense Service

**File:** `src/lib/services/expenses/updateExpense.ts`

**Tasks:**
1. Define `UpdateExpenseError` class with error codes:
   - `EXPENSE_NOT_FOUND`
   - `EXPENSE_QUERY_FAILED`
   - `CATEGORY_NOT_FOUND`
   - `CATEGORY_LOOKUP_FAILED`
   - `EXPENSE_UPDATE_FAILED`

2. Create helper functions:
   - `fetchExpenseForUpdate()`: Verify existence and ownership
   - `ensureCategoryExists()`: Validate category (reuse from createExpense or make shared)
   - `toExpenseDTO()`: Map database row to DTO (reuse from getExpenseById or make shared)

3. Implement `updateExpense()` main function:
   ```typescript
   export async function updateExpense({
     supabase,
     userId,
     expenseId,
     input,
     requestId
   }: UpdateExpenseParams): Promise<ExpenseDTO>
   ```

4. Service logic flow:
   - Fetch existing expense with `user_id` filter and `deleted = false` check
   - If not found, throw `EXPENSE_NOT_FOUND`
   - If `categoryId` provided, validate it exists
   - Build update payload (only include provided fields)
   - Execute update with `.update().select().single()`
   - Map result to DTO and return

**Key Implementation Details:**
- Filter by `user_id` in fetch to enforce authorization
- Exclude soft-deleted expenses (`eq("deleted", false)`)
- Only include provided fields in update payload
- Transform DTO field names to database column names (camelCase → snake_case)
- Handle `description: null` as explicit clear vs undefined as "don't change"

### Step 3: Update Expenses Route Handler

**File:** `src/pages/api/expenses/[id].ts`

**Tasks:**
1. Add PATCH export alongside existing GET export
2. Follow same structure as GET handler:
   - Extract `requestId` from request
   - Validate Supabase availability
   - Validate authentication (session)
   - Validate expense ID from path params
3. Parse and validate request body:
   ```typescript
   const rawBody = await request.json();
   const input = validateUpdateExpenseCommand(rawBody);
   ```
4. Call service layer:
   ```typescript
   const updated = await updateExpense({
     supabase,
     userId: session.user.id,
     expenseId,
     input,
     requestId
   });
   ```
5. Return success response (200 OK) with updated expense DTO
6. Handle errors with appropriate status codes (see Error Handling section)

**Error Handling Pattern:**
```typescript
export const PATCH: APIRoute = async ({ params, locals, request }) => {
  const requestId = getRequestId(request);
  
  // Validation and auth checks...
  
  try {
    const updated = await updateExpense({...});
    return buildJsonResponse(updated, 200, requestId);
  } catch (error) {
    if (error instanceof UpdateExpenseError) {
      // Map error codes to HTTP status codes
    }
    return buildErrorResponse(500, {...}, requestId);
  }
};
```

### Step 4: Update Service Index Export

**File:** `src/lib/services/expenses/index.ts`

**Tasks:**
1. Export `updateExpense` function
2. Export `UpdateExpenseError` class and error code type
3. Maintain alphabetical order of exports

```typescript
export { updateExpense, UpdateExpenseError, type UpdateExpenseErrorCode } from "./updateExpense";
```

### Step 7: Create Integration/E2E Tests

**File:** `api-testing/expenses-update.http` (HTTP client test file)

**Test Scenarios:**
```http
### Update expense amount
PATCH {{baseUrl}}/api/expenses/{{expenseId}}
Content-Type: application/json
Cookie: {{authCookie}}

{
  "amount": 49.99
}

### Update multiple fields
PATCH {{baseUrl}}/api/expenses/{{expenseId}}
Content-Type: application/json
Cookie: {{authCookie}}

{
  "name": "Updated Coffee Shop",
  "description": "Three lattes and a muffin",
  "amount": 35.50
}

### Clear description
PATCH {{baseUrl}}/api/expenses/{{expenseId}}
Content-Type: application/json
Cookie: {{authCookie}}

{
  "description": null
}

### Invalid expense ID (should return 400)
PATCH {{baseUrl}}/api/expenses/invalid-uuid
Content-Type: application/json
Cookie: {{authCookie}}

{
  "amount": 10.00
}

### Non-existent expense (should return 404)
PATCH {{baseUrl}}/api/expenses/00000000-0000-0000-0000-000000000000
Content-Type: application/json
Cookie: {{authCookie}}

{
  "amount": 10.00
}
```

### Step 8: Code Review and Linting

**Tasks:**
1. Run ESLint and fix any violations
2. Verify TypeScript compilation (no errors)
3. Check code formatting (Prettier or similar)
4. Review error handling completeness
5. Verify all edge cases are covered
6. Ensure consistent naming conventions
7. Validate proper use of async/await
8. Check for potential race conditions

---

## Summary

This implementation plan provides a comprehensive guide for implementing the PATCH `/expenses/{id}` endpoint following established patterns in the codebase. The endpoint will support partial updates with proper validation, authorization, and error handling while maintaining consistency with existing endpoints.

**Key Success Criteria:**
- ✅ Proper input validation with at least one field required
- ✅ Authorization enforced at service layer
- ✅ Soft-deleted expenses not updated
- ✅ Category existence validated
- ✅ Appropriate HTTP status codes returned
- ✅ Comprehensive error handling
- ✅ Security considerations addressed
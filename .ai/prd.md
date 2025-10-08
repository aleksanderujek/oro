# Product Requirements Document (PRD) - oro

## 1. Product Overview

oro is a lightweight personal expense tracker focused on speed and clarity. It enables users to log expenses in seconds and understand spending patterns without complex integrations or clutter. The MVP centers on an amount-first Quick Add flow, automatic categorization via AI, a performant list with essential filters, and a dashboard that visualizes where money goes.

Primary objectives
- Minimize time-to-save for a new expense to under 5 seconds in typical conditions
- Automatically categorize at least 80% of expenses with minimal user input
- Provide clear monthly visibility of spend distribution and trends

Target users
- Individuals who manually track personal spending
- Users who prefer a fast, low-friction, mobile-first web experience without bank connections

Assumptions
- Single-user, authenticated usage
- PLN as the only currency in MVP; timestamps stored in UTC; default to device time for inputs
- Modern evergreen browsers on mobile and desktop; no offline mode in MVP

Dependencies
- Authentication: Magic link email + Google OAuth
- Data: Hosted Postgres (e.g., Supabase) with row-level security
- AI categorization service with server-side timeout and spend cap
- Analytics: PostHog for event instrumentation

## 2. User Problem

People often lose track of where their money goes because recording expenses is slow or complicated. They need an effortless way to capture spending at the moment it happens, and a simple view to understand totals, trends, and category breakdowns.

Goals
- Make adding an expense nearly instantaneous
- Reduce cognitive load when choosing categories via AI assistance
- Enable quick insight into monthly spending patterns and top categories

## 3. Functional Requirements

3.1 Authentication and Sessions
- Sign-in options: Magic link via email and Google OAuth
- Rolling sessions valid for 30 days from last activity
- Minimal PII storage; email address only where required for auth
- Session management UI limited to sign-in and sign-out in MVP (no device management)
- All timestamps stored in UTC; default form inputs to device local time

3.2 Expense Model and Validation
- Fields
  - amount: PLN, non-negative, 2 decimals, required
  - name: up to 64 chars, required
  - description: up to 200 chars, optional
  - date: required, default now (device time), stored UTC
  - category: fixed taxonomy of 15 categories (plus Uncategorized), required unless saved as Uncategorized
  - account: optional enum {Cash, Card}; default to last used
  - metadata: internal fields (ids, timestamps, userId)
- Amount input behavior
  - Accept both “.” and “,” as decimal separators; normalize to 2 decimals, round half up
  - Show thousands separators on blur
  - Reject negative values; show inline validation errors

3.3 Categories and Accounts
- Categories
  - Fixed set of 15 categories defined centrally for MVP; include an Uncategorized placeholder
  - Users can manually choose a category; AI suggestions appear when available
- Accounts
  - Enum {Cash, Card}; optional per expense
  - Default to last used account; can be filtered in list and dashboard

3.4 Quick Add Flow
- Flow is amount-first, then name, then optional description/date/account
- AI categorization
  - Triggered with a 200 ms debounce after name input stabilizes
  - Confidence threshold: auto-apply when confidence ≥ 0.75
  - If confidence < 0.75, show top 3 suggestions; user can pick or open full list
  - Per-user merchant-to-category mapping is checked before invoking AI
- Performance and resilience
  - Server-side AI timeout at 400 ms; on timeout or failure, immediately show manual categories and allow saving as Uncategorized
  - Form state is preserved on save error; show retry option
- Completion
  - Primary action saves the expense; confirm or close returns to list/dashboard quickly

3.5 Per-user Mappings and Normalization
- Before AI
  - Normalize merchant text (trim, casefold, remove punctuation/diacritics)
  - Exact match mapping applied; else apply trigram similarity; match when score ≥ 0.8
- After user corrections
  - Update per-user mapping with the chosen category
  - Track overwrite rate (when AI suggestion is overridden)

3.6 Expense CRUD
- Create: via Quick Add or full form; validations as above
- Edit: amount, name, description, date, category, account
- Delete: soft delete with 7-day undo window; hard delete after 7 days
- Undo: user can restore a soft-deleted expense within 7 days

3.7 Expense List View
- Default sort: date desc, then amount desc for ties
- Filters
  - Time: Month (current month), Last 7 days, Last month
  - Category: single or multiple selection
  - Account: {Cash, Card}
- Search: free-text across name and description, case-insensitive
- Pagination: infinite scroll with server-side cursor; 50 items per page
- Empty state: helpful message and quick link to add a new expense

3.8 Dashboard
- Cards and charts
  - Monthly total spending (current month)
  - Daily spend bar chart (current month)
  - Month-over-month delta card (percent and absolute)
  - Donut chart of top categories with percentage share
- Interactions
  - Tap/click on a category segment to drill through to the list view filtered by that category and month

3.9 Analytics and Metrics (PostHog)
- Event instrumentation (names illustrative; final schema to be confirmed)
  - expense_add_started {ts}
  - expense_saved {ts, amount, category, account, latency_ms}
  - expense_save_failed {ts, error_code}
  - ai_categorization_requested {ts}
  - ai_categorization_received {ts, confidence, category, latency_ms}
  - ai_categorization_timeout {ts}
  - ai_category_overridden {ts, from_category, to_category}
  - list_viewed {ts, filters, has_search}
  - dashboard_viewed {ts}
  - dashboard_drilldown {ts, category}
- Derived metrics
  - Time-to-save = expense_saved.ts − expense_add_started.ts
  - AI correction rate = overrides / auto-applied
  - AI latency P95 tracked from request to response

3.10 Performance Targets
- AI response P95 < 350 ms in production
- Categorization timeout strictly at 400 ms
- List and dashboard interactions render within 100 ms after data fetch completes

3.11 Security, Privacy, and Compliance
- Row-level security: users can only read/write their own expenses
- Minimal PII: store only what is necessary for auth and events
- Data handling
  - All timestamps stored in UTC
  - Soft-deleted records retained for 7 days; permanently removed afterward
- Rate limiting for auth endpoints and magic link requests

3.12 Error and Empty States
- AI timeout or failure: show manual categories immediately; allow save as Uncategorized
- Save failure: preserve form values; show retry action and non-blocking error
- List/dashboard empty: show guidance to add first expense

3.13 Internationalization and Formatting
- Currency: PLN only in MVP
- Amount formatting: 2 decimals, round half up, thousands separators on blur
- Accept both comma and dot as decimal input

## 4. Product Boundaries

In scope (MVP)
- Add, edit, delete (soft delete with undo, hard delete after 7 days)
- AI-based categorization with per-user mappings
- Expense list with time/category/account filters, search, sorting, infinite scroll
- Dashboard with monthly total, daily bars, MoM delta, donut breakdown, drill-through
- Authentication via magic link and Google OAuth; 30-day rolling sessions
- PostHog analytics for key funnels and AI performance

Out of scope (MVP)
- Bank connections or external API imports
- Multi-currency support and conversions
- Budgets, savings goals, or advanced analytics
- Shared or group expenses; multi-user shared ledgers
- Offline mode or background sync
- Device/session management UI beyond sign-in/sign-out

Open questions and dependencies
- Select primary AI provider and set a monthly spend cap
- Email deliverability setup for magic links (domain, provider, DKIM/SPF, rate limiting/abuse protections)
- Finalize PostHog event schema, environments (staging/prod), and autocapture policy
- Define visual UX for AI timeout/manual categorization and save retry flows
- Accessibility targets and supported browsers/devices; confirm mobile-first and PWA installability requirements
- Data retention policies for PII and analytics beyond expense soft delete window

## 5. User Stories

ID: US-001
Title: Sign in with magic link
Description: As a user, I can request a magic link and sign in via email without a password.
Acceptance Criteria:
- A user enters an email and requests a magic link
- The user receives an email with a single-use link valid for a limited time
- Opening the link signs the user in and redirects to the app
- Invalid or expired links show an error and a path to request a new link
- Rate limiting prevents abusive repeated requests

ID: US-002
Title: Sign in with Google
Description: As a user, I can sign in using my Google account.
Acceptance Criteria:
- Google OAuth button is available on the sign-in screen
- Successful OAuth flow creates or restores the user session
- On success, the user is redirected to the app
- On failure, a friendly error is shown with retry

ID: US-003
Title: Session persistence (30-day rolling)
Description: As a signed-in user, my session persists for up to 30 days of activity.
Acceptance Criteria:
- Session remains active across app restarts within the rolling window
- Inactivity beyond 30 days prompts re-authentication
- Secure storage is used for tokens per platform standards

ID: US-004
Title: Sign out
Description: As a user, I can sign out to terminate my session.
Acceptance Criteria:
- A sign-out action is available in the app
- After sign-out, protected routes redirect to sign-in

ID: US-005
Title: Invalid or expired magic link handling
Description: As a user, I see a clear message if my magic link is invalid or expired.
Acceptance Criteria:
- Opening an invalid/expired link shows a non-technical error message
- A call-to-action lets me request a new link

ID: US-006
Title: Excessive magic link requests
Description: As a user, I am prevented from sending too many magic links in a short period.
Acceptance Criteria:
- Rate limiting triggers after a defined threshold
- The UI shows a friendly message and retry-after guidance

ID: US-010
Title: Quick Add expense (amount-first)
Description: As a user, I can add an expense by entering amount first, then name, and save quickly.
Acceptance Criteria:
- Amount field is focused by default on Quick Add
- Name becomes required before save; description/date/account optional
- Save button is enabled only when required fields are valid
- Typical add completes end-to-end in under 5 seconds

ID: US-011
Title: Amount input formatting and validation
Description: As a user, my amount input accepts dot or comma decimals and formats correctly.
Acceptance Criteria:
- Input accepts both “.” and “,” for decimals
- Value normalizes to two decimals on blur with round half up
- Thousands separators are applied on blur
- Negative values are rejected with an inline error

ID: US-012
Title: AI auto-apply category on high confidence
Description: As a user, my expense is auto-categorized when AI confidence ≥ 0.75.
Acceptance Criteria:
- On AI response with confidence ≥ 0.75, category is applied automatically
- The applied category is visible and can be changed before saving
- Event logs capture confidence and latency

ID: US-013
Title: AI suggestions when confidence is low
Description: As a user, I see the top 3 category suggestions when AI confidence < 0.75.
Acceptance Criteria:
- A suggestions UI shows up to 3 categories ranked by confidence
- I can pick a suggestion or open the full list
- My choice overrides any prior suggestion

ID: US-014
Title: AI timeout fallback to manual
Description: As a user, if AI is slow (> 400 ms) or unavailable, I can choose a category manually.
Acceptance Criteria:
- After 400 ms without AI response, the UI switches to manual categories
- I can save as Uncategorized without waiting for AI
- Event logs record timeouts

ID: US-015
Title: Per-user merchant mapping applied before AI
Description: As a user, common merchants I use are categorized automatically without waiting for AI.
Acceptance Criteria:
- Merchant text is normalized before lookup
- Exact match applies a mapped category
- Otherwise, trigram similarity ≥ 0.8 applies a mapped category
- If no mapping, proceed to AI flow

ID: US-016
Title: Save without category when AI unavailable
Description: As a user, I can save an expense as Uncategorized if AI is slow or fails.
Acceptance Criteria:
- Save is enabled with Uncategorized when AI times out or errors
- The expense appears in lists with category = Uncategorized
- I can edit later to assign a category

ID: US-017
Title: Preserve form on save failure
Description: As a user, my inputs are preserved if saving fails so I can retry.
Acceptance Criteria:
- On network or server errors, values remain in the form
- A clear error is shown with a Retry action

ID: US-018
Title: Default account to last used
Description: As a user, the account field defaults to my last used selection.
Acceptance Criteria:
- Account pre-fills from my most recent saved expense
- I can change it prior to saving

ID: US-019
Title: Date defaults and storage
Description: As a user, the date defaults to now and is stored in UTC.
Acceptance Criteria:
- Date field defaults to device local time now
- Stored value is UTC; list and charts display in local time

ID: US-030
Title: Edit expense
Description: As a user, I can edit any field of an existing expense.
Acceptance Criteria:
- Fields amount, name, description, date, category, account are editable
- Validations match creation rules
- Changes persist and are immediately reflected in list and dashboard

ID: US-031
Title: Soft delete with undo
Description: As a user, I can delete an expense and undo within 7 days.
Acceptance Criteria:
- Deleting moves expense to a soft-deleted state
- An undo affordance is shown immediately after delete
- Expense remains recoverable for 7 days

ID: US-032
Title: Restore soft-deleted expense
Description: As a user, I can restore a soft-deleted expense within 7 days.
Acceptance Criteria:
- Restored expense reappears with original data intact
- Related charts and totals update accordingly

ID: US-033
Title: Hard delete after 7 days
Description: As a system, soft-deleted expenses are permanently removed after 7 days.
Acceptance Criteria:
- Soft-deleted items are no longer recoverable after 7 days
- They are excluded from lists, charts, and storage beyond retention

ID: US-040
Title: List default sort
Description: As a user, expenses are sorted by date desc, then amount desc.
Acceptance Criteria:
- Most recent expenses appear first
- Ties on date are ordered by amount desc

ID: US-041
Title: Time filters
Description: As a user, I can filter expenses by Month, Last 7 days, and Last month.
Acceptance Criteria:
- Predefined time filters are available and mutually exclusive
- List updates immediately upon selection

ID: US-042
Title: Text search
Description: As a user, I can search expenses by name or description.
Acceptance Criteria:
- Case-insensitive contains search across name and description
- Search can be combined with time/category/account filters

ID: US-043
Title: Infinite scroll with cursor
Description: As a user, I can scroll through expenses with seamless pagination.
Acceptance Criteria:
- 50 items load per page using a server-side cursor
- Reaching the end triggers loading the next page automatically
- Loading state is indicated; no duplicates appear

ID: US-044
Title: Category filter
Description: As a user, I can filter the list by one or more categories.
Acceptance Criteria:
- Category multi-select applies to the list
- Combined with time, account, and search filters

ID: US-045
Title: Account filter
Description: As a user, I can filter the list by account.
Acceptance Criteria:
- Account filter offers Cash and Card
- Works in combination with other filters

ID: US-046
Title: Clear filters
Description: As a user, I can clear all active filters quickly.
Acceptance Criteria:
- A single action resets filters and search to defaults
- List updates to default view

ID: US-047
Title: Empty state for no results
Description: As a user, I see a helpful message when no expenses match filters/search.
Acceptance Criteria:
- Message indicates no results with current criteria
- Provides an action to clear filters or add a new expense

ID: US-050
Title: Dashboard monthly total
Description: As a user, I can see total spending for the current month.
Acceptance Criteria:
- Displays sum of all expenses in the current month respecting filters
- Updates as expenses are added/edited/deleted

ID: US-051
Title: Daily spend bar chart
Description: As a user, I can see a bar chart of daily spend for the current month.
Acceptance Criteria:
- Each bar represents total spend per day
- Time zone display aligns with device local time

ID: US-052
Title: Month-over-month delta card
Description: As a user, I can see the spending delta vs the previous month.
Acceptance Criteria:
- Shows absolute and percent change vs prior month total
- Handles cases where prior month total is zero

ID: US-053
Title: Donut of top categories
Description: As a user, I can see a donut chart of top categories by percentage.
Acceptance Criteria:
- Segments represent share of total spend by category
- Percentages sum to 100% with rounding tolerance

ID: US-054
Title: Drill-through from dashboard to list
Description: As a user, tapping a category shows a filtered list of expenses for that category and month.
Acceptance Criteria:
- Drill-through applies category and time filters to list view
- Back navigation returns to dashboard state

ID: US-060
Title: Time-to-save instrumentation
Description: As a system, I capture timestamps to compute time-to-save.
Acceptance Criteria:
- expense_add_started and expense_saved events include timestamps
- Latency is derived and available for analysis

ID: US-061
Title: AI accuracy and corrections tracking
Description: As a system, I track AI auto-categorization and user corrections.
Acceptance Criteria:
- ai_categorization_received logs confidence and category
- ai_category_overridden logs from/to categories
- Correction rate is computable from events

ID: US-062
Title: Dashboard engagement tracking
Description: As a system, I track dashboard views and drill-downs.
Acceptance Criteria:
- dashboard_viewed and dashboard_drilldown are emitted with timestamps
- Drill-down includes selected category property

ID: US-070
Title: AI provider performance and timeouts
Description: As a system, I enforce a hard 400 ms timeout and track latency.
Acceptance Criteria:
- Requests exceeding 400 ms produce timeout events and fallback
- P95 AI latency is monitored and reported

ID: US-071
Title: Update mappings on user correction
Description: As a system, I update per-user merchant mappings when users change categories.
Acceptance Criteria:
- Post-edit, the mapping stores merchant-to-category for the user
- Future exact or ≥ 0.8 trigram matches apply the mapped category

ID: US-080
Title: Row-level security
Description: As a system, I restrict data access so users can only access their own expenses.
Acceptance Criteria:
- Authenticated requests are scoped to the userId
- Attempts to access other users’ data are denied

ID: US-081
Title: Minimal PII and UTC storage
Description: As a system, I store only necessary PII and keep timestamps in UTC.
Acceptance Criteria:
- No sensitive personal data beyond required auth identifiers is stored
- All timestamps are persisted in UTC

## 6. Success Metrics

Primary success criteria
- Add expense in under 5 seconds: 90% of add flows complete within 5 seconds from first input to persisted save under normal network conditions
- AI categorization accuracy: at least 80% of expenses auto-categorized without user correction
- Weekly understanding: users who added expenses can view dashboard and identify top categories within one week

Operational and performance metrics
- AI latency P95 < 350 ms; timeout rate tracked and below target threshold
- Save success rate and overall error rate monitored; alerting for regressions
- Soft delete recovery rate (percentage of deleted items restored within 7 days)
- Retention: 7-day and 28-day active user retention for users who added at least one expense

Measurement approach
- PostHog events and timers for funnels, AI accuracy, and engagement
- Server logs for AI requests, timeouts, and errors
- Dashboards combining client and server telemetry for end-to-end visibility

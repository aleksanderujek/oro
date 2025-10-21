# UI Architecture for oro

## 1. UI Structure Overview

The user interface for oro will be a responsive, mobile-first single-page application (SPA) built with Astro and React. Astro will handle static site generation and server-side rendering for initial loads, while React will be used for interactive UI "islands" like forms, lists, and dashboards.

The architecture is designed for speed and a seamless user experience, adhering to the following core principles:
- **Component-Based:** The UI is built entirely with the Shadcn/ui component library, styled with Tailwind CSS, ensuring visual consistency and rapid development.
- **State Management:** A dual strategy is employed:
    - **Zustand:** For minimal global client state (e.g., auth status, user profile).
    - **TanStack Query:** For all server state, managing data fetching, caching (`stale-while-revalidate`), and synchronization with the API. It will power features like infinite scrolling and optimistic updates.
- **Responsiveness:** A fluid layout adapts to screen sizes. The primary navigation shifts from a bottom tab bar on mobile to a vertical sidebar on desktop.
- **Security:** Authentication tokens (JWTs) are managed server-side by Astro and stored in `HttpOnly` cookies, mitigating XSS risks by preventing client-side script access.
- **Accessibility:** The application will adhere to WCAG AA standards, using semantic HTML, ARIA attributes for dynamic components, and ensuring proper color contrast.

## 2. View List

### Authentication View
- **View Path:** `/login`
- **Main Purpose:** To allow new and returning users to sign in to the application.
- **Key Information:** Email input field for magic link authentication and a button for Google OAuth.
- **Key View Components:**
    - `Card`: To frame the login form.
    - `Input`: For email entry.
    - `Button`: For submitting the magic link request and initiating Google OAuth.
- **UX, Accessibility, and Security Considerations:**
    - **UX:** Clear, focused interface with two distinct sign-in options. Rate limiting feedback ("Try again in a few moments") will be displayed if the user makes too many requests.
    - **Accessibility:** Form inputs will have associated labels. Buttons will have descriptive text.
    - **Security:** All authentication logic is handled by the backend, proxying to Supabase.

### Auth Callback View
- **View Path:** `/auth/callback`
- **Main Purpose:** A transient page to handle the redirect from the authentication provider (magic link or Google). It finalizes the session and redirects the user.
- **Key Information:** Loading indicator.
- **Key View Components:**
    - `Spinner` or `Loader`: To indicate that the session is being established.
- **UX, Accessibility, and Security Considerations:**
    - **UX:** The user should only see this page for a brief moment. On failure, a clear error message with a link back to the login page will be shown.

### Dashboard View
- **View Path:** `/` (Root for authenticated users)
- **Main Purpose:** To provide a high-level, visual summary of the user's spending for a selected period.
- **Key Information:**
    - Total spending for the selected month.
    - Month-over-month spending change (percentage and absolute).
    - A bar chart of daily spending for the month.
    - A donut chart of spending distribution across top categories.
- **Key View Components:**
    - `Card`: For displaying individual metrics (Total Spend, MoM Delta).
    - `BarChart`: For daily spending visualization.
    - `DonutChart`: For category breakdown.
    - `Select`/`Dropdown`: For filtering the dashboard by month and account (`Cash`/`Card`).
    - `SkeletonLoader`: For initial loading states of charts and metrics.
- **UX, Accessibility, and Security Considerations:**
    - **UX:** The donut chart segments will be interactive, allowing users to drill through to a filtered expense list. The layout will be a single column on mobile and a grid on desktop.
    - **Accessibility:** Charts will be implemented with ARIA attributes. A fallback data table will be available for screen reader users.
    - **Security:** Data is scoped to the authenticated user via RLS policies enforced by the API.

### Expense List View
- **View Path:** `/expenses`
- **Main Purpose:** To provide a detailed, paginated, and filterable list of all expenses.
- **Key Information:** A list of transactions, each showing merchant name, amount, date, and category.
- **Key View Components:**
    - `Input` (for text search).
    - `DropdownMenu`/`Select` (for time range, category, and account filters).
    - `ExpenseListItem`: A component for rendering a single row.
    - `InfiniteScroll` container powered by TanStack Query's `useInfiniteQuery`.
    - `SkeletonLoader`: For the initial page load and subsequent page fetches.
    - `EmptyState`: Displayed when no expenses match the current filters.
- **UX, Accessibility, and Security Considerations:**
    - **UX:** Filters are synchronized with URL query parameters, allowing for shareable and bookmarkable views. Infinite scroll provides a seamless browsing experience.
    - **Accessibility:** Search and filter controls will be properly labeled. The list will be navigable via keyboard.
    - **Security:** All data fetching is authenticated and restricted to the current user's expenses.

### Settings View
- **View Path:** `/settings`
- **Main Purpose:** To allow users to configure their personal preferences.
- **Key Information:**
    - Timezone setting.
    - Default payment account (`Cash`/`Card`).
    - Theme preference (Light/Dark mode).
    - User email and a sign-out button.
- **Key View Components:**
    - `Select`: For choosing timezone and default account.
    - `Switch`: For toggling the theme.
    - `Button`: For signing out.
- **UX, Accessibility, and Security Considerations:**
    - **UX:** Changes are saved automatically on modification with visual feedback. The sign-out action will ask for confirmation.
    - **Accessibility:** All form controls will be labeled according to WCAG standards.
    - **Security:** The sign-out button will securely invalidate the user's session by clearing the `HttpOnly` cookie.

## 3. User Journey Map

A primary user journey from sign-in to viewing a newly added expense.

1.  **Authentication:** The user lands on `/login`, authenticates via magic link or Google, and is redirected to the `/` (Dashboard) view upon success.
2.  **Initiate Add Expense:** From the Dashboard, the user taps the global Floating Action Button (FAB).
3.  **Expense Creation:** The `ExpenseForm` drawer appears. The user inputs an amount and a merchant name. The `useCategorization` hook automatically fetches a category suggestion. The user confirms the details and saves.
4.  **Optimistic Update:** The drawer closes, and the UI optimistically updates. The dashboard's "Total Spend" metric immediately reflects the new amount. A toast notification confirms the expense was saved.
5.  **Navigate to List:** The user navigates to the `Expense List` view (`/expenses`) using the main navigation.
6.  **View New Expense:** The newly created expense appears at the top of the list.
7.  **Filter and Search:** The user applies a category filter to narrow down the list and sees the results update instantly.
8.  **Edit Expense:** The user taps on an expense, which re-opens the `ExpenseForm` pre-populated with its data. They adjust the amount and save. The list updates to reflect the change.
9.  **Delete Expense:** The user swipes to delete an expense. The item is optimistically removed from the list, and an `UndoToast` appears, giving them 7 seconds to restore it.
10. **Sign Out:** The user navigates to `/settings` and clicks "Sign Out", ending their session and returning to the `/login` page.

## 4. Layout and Navigation Structure

A single, persistent layout component wraps all authenticated views, managing the responsive navigation structure.

-   **Mobile (`< 768px`):**
    -   **Navigation:** A `BottomTabBar` provides access to the three main views: `Dashboard`, `Expenses`, and `Settings`.
    -   **Primary Action:** A `FloatingActionButton` (FAB) is overlaid on the content, providing a persistent and easily accessible entry point for the "Quick Add" expense flow.

-   **Desktop (`>= 768px`):**
    -   **Navigation:** A `Sidebar` is fixed to the left of the screen, containing navigation links to `Dashboard`, `Expenses`, and `Settings`.
    -   **Primary Action:** A prominent "Add Expense" button is placed at the top of the sidebar.

-   **Header:** A minimal header on desktop will display the current view's title. On mobile, the title will be part of the view itself to save vertical space.

## 5. Key Components

These are reusable, self-contained components that form the core of the UI.

-   **`ExpenseForm`:** A drawer (mobile) or dialog (desktop) component for creating and editing expenses. It contains the form fields, validation logic, and state management for the entire add/edit flow. It leverages the `useCategorization` hook.
-   **`useCategorization` (Hook):** A custom React hook that encapsulates the complex logic for expense categorization. It debounces user input, queries the `/merchant-mappings/resolve` endpoint, and falls back to the `/ai/categorize` endpoint if no mapping is found.
-   **`UndoToast`:** A specialized toast component that appears after a soft delete. It displays a message and an "Undo" action that, when clicked, calls the restore endpoint.
-   **`ExpenseListItem`:** A component that renders a single expense in the list, displaying its name, amount, category, and date. It also handles gestures like tap-to-edit.
-   **`EmptyState`:** A reusable component shown in the dashboard and expense list when there is no data to display. It provides a clear message and a call-to-action (e.g., a button to add the first expense).
-   **`SkeletonLoader`:** A component that mimics the layout of content (like list items or dashboard cards) while data is being fetched, preventing layout shifts and improving perceived performance.

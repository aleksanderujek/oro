## Oro

![Version](https://img.shields.io/badge/version-0.0.1-blue) ![Node](https://img.shields.io/badge/node-22.14.0-339933?logo=node.js&logoColor=white) ![Astro](https://img.shields.io/badge/Astro-5-ff5d01?logo=astro&logoColor=white) ![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=061a2b) ![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white) ![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

## Project description

oro is a lightweight personal expense tracker focused on speed and clarity. It lets users log expenses in seconds and understand spending patterns without bank integrations or clutter. The MVP centers on an amount‑first Quick Add flow, AI‑assisted categorization, a fast list with essential filters and search, and a dashboard that visualizes where money goes.

Key objectives:
- Minimize time‑to‑save for a new expense to under 5 seconds
- Automatically categorize at least 80% of expenses with minimal input
- Provide clear monthly visibility of spend distribution and trends

Additional docs: [PRD](./.ai/prd.md) · [Tech Stack](./.ai/tech-stack.md)

## Table of Contents

- [Project description](#project-description)
- [Tech stack](#tech-stack)
- [Getting started locally](#getting-started-locally)
- [Available scripts](#available-scripts)
- [Project scope](#project-scope)
- [Project status](#project-status)
- [License](#license)

## Tech stack

- Frontend: Astro 5, React 19, TypeScript 5, Tailwind CSS 4, Shadcn/ui
- Icons & styling helpers: lucide-react, class-variance-authority, clsx, tailwind-merge
- Backend (planned): Supabase (PostgreSQL, Auth, RLS)
- AI (planned): Openrouter.ai for model access and spend caps
- Analytics (planned): PostHog instrumentation
- CI/CD & Hosting (planned): GitHub Actions, Cloudflare
- Node: 22.14.0 (see `.nvmrc`)
- Tooling: ESLint, Prettier, lint-staged, Husky, Astro CLI

## Getting started locally

### Prerequisites

- Node.js 22.14.0
- npm (comes with Node.js)
- Optional: nvm for node version management

```bash
# Use the exact Node version from .nvmrc
nvm use
```

### Setup

```bash
# 1) Clone the repository
git clone <your-repo-url>
cd oro

# 2) Install dependencies
npm install

# 3) Start the dev server
npm run dev

# 4) Build for production
npm run build

# 5) Preview the production build
npm run preview
```

Configuration
- No environment variables are required for the current UI scaffold.
- Backend, AI, and analytics configuration will be added as those parts land.

## Available scripts

- `npm run dev`: Start the development server
- `npm run build`: Build the production bundle
- `npm run preview`: Preview the production build locally
- `npm run astro`: Run the Astro CLI directly
- `npm run lint`: Run ESLint across the project
- `npm run lint:fix`: Auto-fix lint issues where possible
- `npm run format`: Format files with Prettier

## Project scope

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
- Shared/group expenses; multi-user shared ledgers
- Offline mode or background sync
- Device/session management UI beyond sign-in/sign-out

## Project status

- Status: In development (pre‑MVP). Current version: 0.0.1.
- Performance targets: AI response P95 < 350 ms; timeout strictly at 400 ms; list/dashboard interactions render within 100 ms after data fetch.

Reference: [PRD](./.ai/prd.md) · [Tech Stack](./.ai/tech-stack.md)

## License

MIT

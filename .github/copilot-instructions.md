# Finance App — Copilot Instructions

## Project purpose

This repository contains a personal finance application.

The application allows authenticated users to manage and visualize their financial information, including expenses, accounts, categories, and financial summaries.

The project is also being used as a learning project for:

* Modern frontend development
* Node.js backend development
* Testing
* CI/CD
* GitHub Actions
* Serverless deployment
* Firebase
* AI-assisted software development

## Architecture

The project is organized into separate frontend and backend applications within a single repository.

### Frontend (`src/`)

* Vite + React 18 + TypeScript
* `@tanstack/react-query` for server-state management and data fetching (prefer React Query over manual `useEffect` fetching where applicable)
* Styling: CSS Modules (`*.module.css`) colocated with components, plus global theme variables and base resets in `src/styles/global.css` (avoid inline `style` objects unless values are dynamically calculated at runtime)
* Entry points: `src/main.tsx` and `src/App.tsx`
* UI components: `src/components/`
* Client utilities & Firebase client initialization: `src/lib/firebaseClient.ts`
* Responsible for the user interface and client-side application state.
* Communicates with the backend API (`/api/*`) for operations that require backend access.

### Backend (`api/`)

* Node.js + Express + TypeScript
* `firebase-admin` for privileged server-side Firebase access
* Entry point: `api/index.ts` (runs on port `4000` in local development; exported for Vercel Serverless in production)
* Controllers and shared backend modules: `api/controllers/` and `api/lib/`
* Exposes the application's API.
* Responsible for authentication verification, authorization, validation, business logic, and access to Firebase services.

### Persistence and authentication

* Firebase Authentication is used for user authentication.
* Firestore is used for persistent application data.
* The backend must not trust user identifiers supplied by the client when determining ownership of financial data.
* The authenticated Firebase user's UID should be used to determine data ownership.

### Deployment (`vercel.json`)

The target deployment architecture is:

* Frontend: Vercel static build (`dist`)
* Backend: Vercel Serverless Functions (`api/index.ts` handling `/api/(.*)`)
* Firebase: Authentication and Firestore

Do not assume that the current local development architecture is identical to the production serverless architecture.

### Development commands (`package.json`)

* `npm run dev` — Start the Vite frontend dev server
* `npm run dev:api` — Start the local Express API server (`node --watch api/index.ts`)
* `npm run build` — Run TypeScript type-checking (`tsc`) and build the Vite frontend (`vite build`)
* `npm run preview` — Preview the production frontend build locally

## General development principles

* Prefer simple, maintainable solutions over unnecessary abstractions.
* Do not introduce libraries without explaining why they are necessary.
* Preserve the existing architecture unless there is a clear reason to change it.
* Avoid large refactors when implementing a focused feature.
* Use TypeScript types instead of `any` whenever reasonably possible.
* Keep frontend presentation logic separate from backend business logic.
* Keep Firebase access isolated from React components.
* Keep business logic testable independently from HTTP handlers when practical.

## Security principles

This application handles financial information.

Always consider:

* authentication
* authorization
* user data isolation
* input validation
* malicious or malformed client input
* Firebase security rules
* server-side validation

Never assume that validation performed only in the frontend is sufficient.

Never trust a `userId` supplied by the client as proof of ownership.

## Testing principles

Changes should include appropriate tests when behavior is changed.

Consider the appropriate level:

1. Unit tests
2. API/integration tests
3. Firebase Emulator tests
4. End-to-end tests

Do not create tests solely for the sake of increasing coverage.

Tests should verify meaningful behavior and edge cases.

## CI/CD principles

The project will use GitHub Actions for CI.

CI should eventually validate:

* dependencies
* linting
* TypeScript
* unit tests
* integration tests
* builds

Deployment will be handled separately from CI.

Do not modify CI/CD configuration unless the task requires it.

## AI agent behavior

When working on this repository:

* First inspect the relevant existing code.
* Do not assume the architecture from the documentation if the actual code differs.
* Explain important architectural decisions when they affect the implementation.
* Avoid implementing unrelated improvements.
* When a task is ambiguous, identify the ambiguity before making a significant architectural change.
* Prefer incremental changes that are easy to review and revert.

# Backend Plan

## Goal

Build a TypeScript backend with Node.js and Express that replaces the current localStorage-based data flow with a real API and persistent storage.

## Recommended Structure

- `src/server.ts` for starting the server.
- `src/app.ts` for middleware and route setup.
- `src/routes/` for request paths.
- `src/controllers/` for request handling.
- `src/services/` for business rules.
- `src/db/` or `src/models/` for database access.
- `src/middleware/` for auth, validation, and errors.
- `src/types/` for shared TypeScript types.

## Core Features

- Login and session handling.
- Employee management.
- Availability updates.
- Schedule assignments and removals.
- Audit history for schedule changes.

## Suggested API Endpoints

- `POST /auth/login`
- `POST /auth/logout`
- `GET /me`
- `GET /employees`
- `POST /employees`
- `PATCH /employees/:id`
- `GET /availability`
- `PUT /availability/:userId`
- `GET /schedule`
- `PUT /schedule`
- `POST /schedule/assign`
- `POST /schedule/remove`
- `GET /audit`

## Data Model

- `users`
- `employees`
- `availability`
- `schedule`
- `schedule_audit`

## Build Order

1. Set up the Express app in TypeScript.
2. Add authentication and role checks.
3. Add employee and availability storage.
4. Add schedule logic and validation.
5. Add audit logging.
6. Replace frontend localStorage calls with API requests.

## Next Step

Create the backend workspace with TypeScript, Express, and a database layer, then define the database schema and the first auth routes.

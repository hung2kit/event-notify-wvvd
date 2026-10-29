# Build prompt: "Phát Tin" internal announcement scheduler

> How to use: attach `phat-tin-wvi-demo.html` together with this prompt. Ask the AI to work **one phase at a time** and stop for your review after each phase.

---

## Context

You are a senior full-stack engineer. Build a production-ready internal web app called **Phát Tin** that lets HR/Admin staff schedule email announcements to internal staff groups (holidays, office notices, reminders). Emails must be sent automatically at the scheduled time, optionally on a recurring cycle, and each schedule can be paused/resumed instantly with a toggle.

The attached file `phat-tin-wvi-demo.html` is the **approved UI design**. It is the source of truth for layout, copy (Vietnamese), interactions and brand styling. Convert it faithfully into a Vue application; do not redesign it.

The organization uses Microsoft 365. Users are in Vietnam (timezone `Asia/Ho_Chi_Minh`). Volume is low (dozens of schedules, a few hundred recipients per send), so prioritize **reliability, correctness and simplicity** over scale. A missed, duplicated or late email is the worst possible failure.

## Tech stack (use these unless you have a strong reason; explain any deviation)

Monorepo with pnpm workspaces and TypeScript (strict) everywhere:

```
apps/web        Vue 3 + Vite frontend
apps/api        Fastify HTTP API
apps/worker     Scheduler + email sender (separate process)
packages/shared zod schemas, types, recurrence helpers shared by all apps
```

**Frontend (`apps/web`)**
- Vue 3 (Composition API, `<script setup>`), Vite, TypeScript
- Vue Router, Pinia
- TanStack Query for Vue (`@tanstack/vue-query`) for server state, caching and optimistic toggle updates
- vee-validate + zod (schemas imported from `packages/shared`)
- Reka UI (headless, accessible primitives) for Switch, Dialog/Drawer, DropdownMenu, Select
- Tiptap for the email body editor (bold, italic, lists, links only)
- `@tabler/icons-vue`, `date-fns` + `date-fns-tz`
- Plain CSS with the design tokens from the demo (CSS custom properties, light + dark mode). No Tailwind, no component library styling.

**Backend (`apps/api`, `apps/worker`)**
- Node.js LTS, Fastify, `@fastify/helmet`, `@fastify/cors`, `@fastify/rate-limit`
- PostgreSQL + Drizzle ORM (with migrations)
- **pg-boss** as the persistent job queue and scheduler (stored in the same PostgreSQL, so no Redis is needed)
- `rrule` for recurrence (RFC 5545), always evaluated in `Asia/Ho_Chi_Minh`
- Email: a `MailTransport` interface with two implementations:
  - `GraphTransport`: Microsoft Graph `sendMail` from a shared mailbox, using `@azure/msal-node` (client credentials) + `@microsoft/microsoft-graph-client`. This is the default.
  - `SmtpTransport`: `nodemailer` with a pooled connection, for SMTP relay or local testing.
  - Selected by env var `MAIL_TRANSPORT=graph|smtp`.
- `sanitize-html` for the email body, `html-to-text` to generate the plain-text part
- `pino` for structured logging
- Auth: Microsoft Entra ID single sign-on (OIDC, authorization code + PKCE). Add a `AUTH_MODE=dev` bypass that logs in as a seeded user for local development.

**Dev & ops**
- Docker Compose for local: `postgres`, `mailpit` (captures SMTP mail for testing), `api`, `worker`, `web`
- Vitest for unit and integration tests, Playwright for one end-to-end smoke test
- ESLint + Prettier
- `.env.example` documenting every variable

## Data model

- `users`: id, email, display_name, role (`admin` | `editor` | `viewer`), created_at
- `recipient_groups`: id, name, description, email_address (a Microsoft 365 distribution list or group address), member_count, is_active
- `announcements`: id, title, body_html, body_text, timezone, start_at (local date + time), frequency (`none` | `daily` | `weekdays` | `weekly` | `monthly` | `yearly`), until_date (nullable), rrule (generated string), is_active, next_run_at (UTC, nullable), version (for optimistic locking), created_by, updated_by, created_at, updated_at, deleted_at
- `announcement_groups`: announcement_id, group_id
- `deliveries`: id, announcement_id, scheduled_for (UTC), status (`queued` | `sending` | `sent` | `failed` | `skipped`), attempts, last_error, provider_message_id, recipient_count, sent_at
  - **UNIQUE (announcement_id, scheduled_for)**. This constraint is the core guarantee against duplicate sends.
- `audit_log`: who changed what and when (create, edit, toggle, delete, test send)

## Scheduling and delivery: reliability requirements

This is the most important part. Implement exactly this design and cover it with tests.

1. **Store intent, not timers.** Each active announcement stores `next_run_at` (UTC). Never rely on in-memory `setTimeout`/cron timers holding the schedule.
2. **Scheduler tick.** The worker registers a pg-boss schedule that runs every 30 seconds. Each tick, in a single transaction:
   - select announcements where `is_active = true AND deleted_at IS NULL AND next_run_at <= now()` using `FOR UPDATE SKIP LOCKED`;
   - insert a `deliveries` row (`status = queued`) with `ON CONFLICT DO NOTHING`;
   - enqueue a pg-boss `send-announcement` job with `singletonKey = announcement_id + scheduled_for`;
   - advance `next_run_at` to the next occurrence computed by `rrule` (or set it to null and `is_active = false` for one-time sends and finished series).
   Running two worker instances at once must never produce a duplicate email.
3. **Send job.** Before sending, re-read the announcement and the delivery row. If the announcement was paused or deleted, or the delivery is no longer `queued`, mark it `skipped` and stop. Otherwise set `sending`, send through `MailTransport`, then set `sent` with `provider_message_id` and `sent_at`.
4. **Retries.** Retry failed sends with exponential backoff (5 attempts: about 1, 2, 4, 8, 16 minutes). Distinguish transient errors (network, 429, 5xx: retry) from permanent ones (invalid recipient, 4xx auth/permission: fail immediately). Respect `Retry-After` from Microsoft Graph. After the final attempt, mark `failed` and show it on the history page.
5. **Downtime catch-up.** On worker start, process every overdue `next_run_at`. If an occurrence is late by less than `MISSED_SEND_GRACE_MINUTES` (default 60), send it. Otherwise mark it `skipped` with reason "missed while offline" and move on, so the server never floods staff with stale emails after an outage.
6. **Edits and toggles.** Toggling off sets `is_active = false` (queued jobs then skip themselves via step 3). Toggling on recomputes `next_run_at` from now, without back-filling past occurrences. Editing date, time or frequency recomputes `next_run_at`. Use the `version` column to reject conflicting concurrent edits with HTTP 409.
7. **Recurrence edge cases.** Monthly on the 29th/30th/31st must fall back to the last day of shorter months. Use the `weekdays` frequency for Monday to Friday. `until_date` is inclusive. All calculations happen in `Asia/Ho_Chi_Minh` and are stored as UTC.
8. **Sending to groups.** Send one email per announcement occurrence addressed to the group email addresses (distribution lists), not one email per person. If more than one group is selected, put them all in `To` (or `Bcc` if `MAIL_USE_BCC=true`).
9. **Graceful shutdown.** On SIGTERM, stop picking up new jobs, finish in-flight sends (up to 30 seconds), then exit. pg-boss must be stopped cleanly.
10. **Observability.** `GET /health` (DB and queue reachable) and `GET /health/worker` (last scheduler tick within 2 minutes). Log every delivery state transition with announcement id and scheduled_for.

## API (Fastify, JSON, all input validated with the shared zod schemas)

- `GET /api/me`
- `GET /api/announcements?status=all|on|off&q=&sort=next|title`: list including the computed `next_run_at`
- `POST /api/announcements`, `GET /api/announcements/:id`, `PUT /api/announcements/:id` (requires `version`), `DELETE /api/announcements/:id` (soft delete)
- `PATCH /api/announcements/:id/active` with body `{ "isActive": boolean }`: used by the list toggle; must respond fast
- `GET /api/announcements/preview?start=&time=&frequency=&until=`: returns the next 4 occurrences for the form preview (the same function the worker uses)
- `POST /api/announcements/:id/test-send`: sends to the current user's own email only
- `GET /api/deliveries?from=&to=&status=`: history page
- `GET /api/groups`
- `GET /api/stats`: running count, paused count, sent this month, next send

Roles: `viewer` read-only, `editor` creates and edits their own announcements and toggles any, `admin` everything including groups.

## Frontend conversion requirements

- Recreate every screen from the demo as Vue components: `AppHeader`, `AppFooter`, `StatsRow`, `AnnouncementToolbar`, `AnnouncementList`, `AnnouncementRow`, `AnnouncementDrawer` (form), `RecipientChips`, `SchedulePreview`, `HistoryTable`, `GroupGrid`, `ToastHost`, plus a `LoginPage` using Microsoft SSO.
- Routes: `/` (schedules), `/history`, `/groups`, `/login`.
- Keep the brand exactly as in the demo: Inter font (Arial fallback), Midnight `#111222`, World Vision Orange `#FF5515`, Field 50 `#F3F2F0`, the orange accent lines, the primary button with orange fill and Midnight text, and light and dark mode via CSS variables. Use the official logo image files (primary for light backgrounds, reverse for dark), never the organization name as plain text. Extract the embedded base64 logos from the demo into `apps/web/src/assets/`.
- The list toggle must update optimistically (instant visual feedback), roll back with an error toast if the API call fails, and never require a page reload.
- The form preview calls the preview endpoint (debounced 300 ms) so the frontend and worker share one source of truth for recurrence.
- Show loading skeletons, empty states, error states and Vietnamese validation messages matching the demo.
- Do not use HTML `<form>` submit navigation; handle submit in JS.
- Accessibility: keyboard navigation for rows, drawer focus trap, Escape to close, visible focus rings, WCAG AA contrast.

## Configuration (`.env.example`)

`DATABASE_URL`, `APP_TIMEZONE=Asia/Ho_Chi_Minh`, `AUTH_MODE=entra|dev`, `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`, `MAIL_TRANSPORT=graph|smtp`, `MAIL_FROM_ADDRESS` (shared mailbox), `MAIL_FROM_NAME=Phát Tin`, `MAIL_USE_BCC=false`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MISSED_SEND_GRACE_MINUTES=60`, `SCHEDULER_INTERVAL_SECONDS=30`, `WEB_ORIGIN`.

Never expose secrets to the frontend. Never log email bodies or credentials.

## Tests (required)

- Unit: recurrence calculation (one-time, daily, weekdays, weekly, monthly on the 31st, yearly on 29 Feb, `until_date` inclusive, past start dates).
- Integration (real Postgres + Mailpit in Docker):
  - a due announcement is sent exactly once even with two workers running;
  - pausing between enqueue and send results in `skipped`;
  - a transient SMTP failure retries and then succeeds;
  - a worker restarted after 3 hours skips stale occurrences and sends recent ones;
  - an edit with a stale `version` returns 409.
- E2E smoke (Playwright): log in (dev mode), create an announcement for 1 minute from now, see it arrive in Mailpit, see "Đã gửi" on the history page.

## Work in phases. Stop after each one and summarize what was done and how to run it.

1. **Scaffold:** monorepo, Docker Compose, database schema and migrations, seed data matching the demo's sample groups and announcements, health endpoints.
2. **Shared + API:** zod schemas, recurrence helpers with tests, all REST endpoints, dev auth.
3. **Worker:** scheduler, send job, retries, catch-up, graceful shutdown, SMTP transport with Mailpit, integration tests.
4. **Frontend:** convert the demo into Vue components wired to the API, with optimistic toggle and preview.
5. **Production readiness:** Microsoft Graph transport, Entra ID SSO, roles, audit log, E2E test, README with deployment steps (Docker on a Linux VM or Azure Container Apps + Azure Database for PostgreSQL).

Ask me before changing the database schema after Phase 1, before adding any dependency not listed above, or if any requirement here conflicts with another.

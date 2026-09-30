# QA Pilot

Manual QA test planning assistant · MVP v0.1.

Stage 4 adds explicit deterministic bug reports to the manual execution workflow:
Home → new test session → analyze with FakeAIProvider → review the saved plan →
execute checks → review results → create and copy a report for a failed check.

## Current browser workflow

- Home lists saved sessions with creation date and generation status. Select
  **New Test Session** (`/sessions/new`) to start, or open an existing session.
- Enter a task title (1–200 characters) and description (1–20,000 characters).
  Blank or whitespace-only values are rejected by server-side Zod validation.
- Select **Analyze Task**. The form displays progress and prevents duplicate
  clicks while the action runs; validation and operation errors retain input.
- The server saves the task, validates FakeAIProvider's output, and atomically
  persists the plan, checks, metadata, and successful generation status.
- Review the saved task, summary, risks, questions, and checks at
  `/sessions/[sessionId]`. Each check shows its ID, type, steps, test data,
  expected result, visible reason, and basis. Refreshing or reopening the URL
  reads SQLite. Return home to reopen it from the saved sessions list.
- If generation or validation fails, the saved session offers a retry using the
  existing session. On a ready plan, **Начать тестирование** creates or resumes
  its single run. The execution page shows one unresolved check at a time,
  including steps, test data, expected result, and reason.
- Record **ПРОЙДЕНО** immediately, or provide a required actual result for
  **ОШИБКА** or a required blocking reason for **ЗАБЛОКИРОВАНО**. The latter two
  can include an optional comment. Results and progress are stored in SQLite;
  refresh and Home navigation resume the first unresolved check. When all
  checks are recorded, the page shows totals and each saved outcome.
- On the completed summary, only FAIL cards offer **Создать баг-репорт**.
  Creating a report snapshots the failed check's title, ordered steps, test data,
  expected result, actual result, and QA comment. No AI is called. Preconditions
  remain unspecified because the check model has no explicit preconditions.
  Existing reports open at `/sessions/[sessionId]/run/bugs/[resultId]`; they are
  never regenerated on reads. **Скопировать баг-репорт** copies plain text, with
  a manual-copy fallback when the browser refuses clipboard access.
- The fake always returns the same username-validation example, regardless of
  the task. Home, input, and review pages explicitly disclose this limitation.

There is no real AI analysis, plan editing/exclusion, result editing, attachment,
bug-report editing, authentication, or deployment workflow yet.
Use this as a local demo; session URLs are not access-controlled.

Each form has a stable session ID. Repeat submissions reuse a completed plan;
failed analysis can retry that session. A conditional status update prevents two
analyses of the same session from running together. Provider calls run outside
the persistence transaction. A terminated process can leave a session RUNNING;
automatic recovery/background jobs are deferred. Create a new session in that
case. There is no schema change or new dependency in Stage 2.

## Local setup

Prerequisites: Node.js **24 LTS**, npm, and Git. No AI key or database server is needed.

```sh
npm ci
npm run db:generate
npm run db:migrate
npm run dev
```

Open <http://127.0.0.1:3000>. The default database is `data/qa-pilot.db`.
Optionally copy `.env.example` to `.env` to customize `DATABASE_URL`. Prisma CLI
loads `.env` using Node's built-in loader; Next.js loads it automatically.
Relative SQLite paths resolve from the project root in both cases. Create the
parent directory yourself if you configure a different location.

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

`npm test` runs domain and database integration tests without paid AI calls.
Integration tests apply the checked-in migration to isolated temporary SQLite
files under `.runtime/`, use the real Prisma adapter, and remove their files.
They do not change the development database. Node's built-in SQLite module is
used only to apply test migrations; it may emit an experimental API warning.

Browser workflow checks (one Chromium project against the production build):

```sh
npx playwright install chromium
npm run build
npm run test:e2e
```

Playwright owns its server on port 3100 and stops it after the tests. It does not
reuse an unrelated server. It applies the migration before browser tests to a unique temporary SQLite
database under `.runtime/` and removes it afterward; the development database
is not used. Tests cover home, validation/correction, pending state, persistence
after reload/reopen, missing sessions, manual execution and completion, bug
creation/reopening, clipboard success/failure, and a narrow viewport. There are
no CI or deployment configurations.

The browser suite also verifies a corrupt stored plan is handled by the generic
error page and that retry re-fetches the repaired data. Test data stays in
the temporary browser-test database. `agentRules: false` in `next.config.ts`
prevents the dev preview from auto-generating unrelated root agent documents.

For a new schema change, use `npm run db:migrate:dev -- --name descriptive_name`;
commit the migration and regenerate the client with `npm run db:generate`.
`npm run db:migrate` only applies existing migrations. There is no seed script.

## Structure

```text
src/app/                 App Router pages, server action, loading/error states
src/domain/schemas/      Zod schemas; all domain TypeScript types use z.infer
src/domain/rules/        Validation that needs related domain records
src/server/ai/           Vendor-free provider contract and deterministic fixture
src/server/services/     Validated generation, session analysis, and execution
src/server/db.ts         Prisma client factory; no import-time connection
src/server/repositories/ Atomic plan writes and validated review reads
src/server/storage/      Reserved for later attachment operations
src/components/ui/       Shared demo notice
src/features/            Task form, plan review, and execution actions
prisma/                  SQLite schema and versioned migrations
tests/                   Unit, integration, browser tests, and synthetic fixtures
```

## Domain and validation boundaries

- `TaskInput`, `TestSession`, `TestPlan`, `TestCheck`, `TestRun`, `CheckResult`,
  `AttachmentMetadata`, and `BugReport` have strict runtime Zod schemas.
- Plans have at most **20** checks, unique IDs and positions, required reasons,
  and at least one nonblank step per check. Empty plans require clarification
  questions and must not become executable in a later stage.
- `sourceRefs` is optional. Checks have stable IDs scoped to their plan and
  nullable `excludedAt`, so future pre-run removal can preserve identity and
  positions. Exclusion operations and plan editing are not implemented.
- FAIL requires `actualResult`; BLOCKED requires `reason`; PASS accepts neither
  failure-only field. FAIL and BLOCKED allow an optional `comment`. Missing
  results mean unexecuted checks.
- `CheckResultsSchema` validates result uniqueness. SQLite also enforces the
  unique `(runId, checkId)` pair and ensures run and check belong to the same plan.
- `BugReportForResultSchema` verifies a FAIL parent, matching result ID, and no
  existing report. The creation service uses it inside a transaction, scopes
  both the run and check to the requested session, and reuses existing reports.
  SQLite enforces unique `BugReport.resultId` for concurrent writes.
- Stage 4 adds only nullable `BugReport.comment` in migration
  `20260930120000_bug_report_comment`. Existing rows and schema relationships
  are preserved. Report content and comments are persisted snapshots; compact
  task/check context is read from the source records. No report editing exists.
- Only one plan per session and one run per plan are supported in v0.1.
- Plans store schema/prompt versions, provider, and model. Arrays use JSON text
  columns; persistence code must parse these values through domain schemas.
  Domain timestamps are ISO strings; Prisma returns `Date` values.
- `generateTestPlan(task, provider)` validates both task and response. The
  provider interface returns `unknown` deliberately. Consumers must use this
  boundary rather than casting an SDK or provider response to a domain type.
- `FakeAIProvider` returns a fresh copy of the same generic username-validation
  fixture for every valid task. It does not analyze the supplied task. Stage 2
  connects it to the form through the validated generation service. No provider
  SDK, paid/external AI call, or seed data is included.

Task creation, generation, persistence, plan review, manual execution, and
deterministic bug reports are implemented. Upload workflows are deferred.
Generated clients, databases, environment files, uploads, and test/build output
are ignored by Git. The existing Word proposal is preserved locally and ignored
because it predates the approved Stage 1 amendments.

## Dependency notes

Versions are pinned in `package.json` and `package-lock.json`. ESLint 9 is retained
because the React/import/accessibility plugins bundled by `eslint-config-next`
16.3.7 do not support ESLint 10. npm currently marks ESLint 9 as deprecated.

The installation audit reports four high-severity entries in the Prisma 7.10.0
dependency chain (`prisma`, `@prisma/config`, `deepmerge-ts`, `mysql2`). The two
underlying packages are transitive, not application dependencies added directly.
This also appears under `npm audit --omit=dev` because of Prisma's dependency/peer
graph. npm's automatic fix proposes a Prisma 6 downgrade. No audit suppression,
forced downgrade, or unverified major-version override has been applied.

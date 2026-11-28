# Northstar Manual Test Report

**Audit date:** 2026-11-25  
**Scope:** Existing application only. No application code or banking logic was changed.

## Summary

- `npm.cmd run lint`: **PASS**.
- `npm.cmd run typecheck`: **PASS**.
- `npm.cmd run build`: **PASS**; Next.js generated 61 static pages and listed the dynamic application/API routes.
- `npm.cmd test`: the direct command is **BLOCKED** in this Windows environment because Node.js 24.11.1 `os.userInfo()` fails with `uv_os_get_passwd returned ENOMEM` before the tests load. Retrying with a temporary, process-only `os.userInfo()` compatibility preload ran the suite: **68 passed, 0 failed, 22 skipped** (90 total).
- Anonymous HTTP smoke checks against the app responding on `localhost:3000`: public `/`, `/login`, `/register` returned 200; `/dashboard`, `/staff/dashboard`, `/admin/dashboard` redirected to `/login`; protected API samples returned 401; `/api/v1/health` returned 200 with `database: connected`.
- No authenticated UI session or destructive/mutating banking workflow was run. README contains no verified demo credentials. The configured application database (`banking_management`) differs from the dedicated test database (`banking_management_task26_test`), and `RUN_DB_INTEGRATION_TESTS` is false. Therefore DB integration tests were skipped and financial behavior remains unverified.
- No reproducible application defect was confirmed during this limited audit. This is not a claim that all workflows pass.

## Project and Route Inventory

README describes a Next.js App Router application for Customer, Staff, and Admin roles, backed by MongoDB/Mongoose, with cookie-based sessions and financial workflows. Existing automated tests are in `tests/`; they cover validation, authorization checks, selected helpers, and opt-in MongoDB integration scenarios. There is no Playwright/Cypress suite or browser automation configuration in the repository.

User-facing routes found under `src/app`:

- **Public/auth:** `/`, `/login`, `/register`.
- **Customer:** `/dashboard`, `/profile`, `/accounts`, `/accounts/[id]`, `/deposit`, `/withdrawal`, `/transfer`, `/transactions`, `/statements`, `/loans`, `/notifications`.
- **Staff:** `/staff/dashboard`, `/staff/customers/new`, `/staff/customers/verification`, `/staff/loans`.
- **Admin:** `/admin/dashboard`, `/admin/users`, `/admin/accounts`, `/admin/customers/verification`, `/admin/deposits`, `/admin/withdrawals`, `/admin/transactions`, `/admin/suspicious-transactions`, `/admin/loans`.

The API route inventory is grouped by role/workflow: `/api/v1/auth/*`, customer account/statement/profile/PIN/analytics/notification/deposit/withdrawal/transfer/transaction/loan endpoints, `/api/v1/staff/*`, and `/api/v1/admin/*`. `npm run build` successfully enumerated these routes.

## Customer Testing

| Feature | Role | Result | Evidence / limitation |
|---|---|---|---|
| Registration and login | Customer | PARTIAL PASS | Automated tests reject malformed input and client-supplied roles; valid account creation and credential login were not run because no test credentials/database opt-in was available. |
| Dashboard and profile | Customer | BLOCKED | Anonymous dashboard redirected to login. Profile unauthenticated API checks pass in tests; signed-in profile read/update was among skipped DB tests. |
| Account details and masked account numbers | Customer | BLOCKED | Authenticated UI and ownership/masking against account records were not exercised. Account ownership API integration scenario was skipped. |
| Deposit requests | Customer | BLOCKED | Validation and unauthenticated rejection tests pass; request creation and staff/admin approval require dedicated DB-backed execution. |
| Withdrawal requests | Customer | BLOCKED | Unauthenticated rejection tests pass; balance guard, approval/rejection and duplicate processing integration scenario was skipped. |
| Fund transfers | Customer | BLOCKED | Schema and unauthenticated API tests pass; ownership, PIN, idempotency, limits, and atomic balance movement integration scenario was skipped. |
| Transaction history and statements | Customer | PARTIAL PASS | Statement calculation, CSV/PDF generation, and validation helper tests pass. Authenticated ownership and live ledger reconciliation were skipped. |
| Loan application and repayment | Customer | BLOCKED | Loan schemas/schedule and repayment model helpers have automated coverage; live application, ownership and repayment scenarios were skipped. |
| Transaction PIN and account limits | Customer | PARTIAL PASS | PIN/limit validation, protected-field model checks, and unauthenticated rejection tests pass. PIN verification, lockout, limit enforcement and balance mutation integration test was skipped. |
| Notifications | Customer | PARTIAL PASS | Query/schema/model and unauthenticated API tests pass. Recipient isolation and read-state database workflow was skipped. |
| Theme switching | Customer | NOT TESTED | Requires interactive browser testing; no browser automation is configured/available in the repository. |
| Logout and protected routes | Customer | PARTIAL PASS | Logout cookie-clearing and auth API tests pass. Anonymous HTTP dashboard redirects and protected API 401 responses were observed. Signed-in logout and role mismatch navigation were not exercised. |

## Staff Testing

| Feature | Role | Result | Evidence / limitation |
|---|---|---|---|
| Staff login and dashboard | Staff | BLOCKED | Anonymous dashboard redirects to login. No verified Staff credentials; valid login/session was not tested. |
| Customer registration | Staff | PARTIAL PASS | Unauthenticated request rejection and prevention of client-selected role/status are tested. Creating a customer and duplicate-email DB behavior were skipped. |
| Customer verification | Staff | PARTIAL PASS | Input schema and unauthenticated rejection are tested. Staff decision persistence and cross-role behavior require skipped DB integration test. |
| Transaction review and suspicious flags | Staff | PARTIAL PASS | Schemas, unauthenticated checks, and model constraints pass. Actual review/flag lifecycle and unchanged financial balances require the skipped DB test. |
| Deposit and withdrawal review | Staff | BLOCKED | No authenticated review UI/session. Atomic approval/rejection scenarios were skipped. |
| Loan review | Staff | BLOCKED | Staff/Admin loan route behavior with persisted records was skipped; no Staff session available. |
| Notifications | Staff | NOT TESTED | The implemented notification page is customer-oriented; staff notification workflow was not established by the inspected routes. |
| Role-based route protection | Staff | PARTIAL PASS | Anonymous Staff dashboard redirects to login and representative protected API requests return 401. Wrong-role authenticated access was not exercised. |

## Admin Testing

| Feature | Role | Result | Evidence / limitation |
|---|---|---|---|
| Admin login and dashboard | Admin | BLOCKED | Anonymous dashboard redirects to login. No verified Admin credentials or authenticated session. |
| User and account management | Admin | PARTIAL PASS | Schema and unauthenticated Admin API checks pass. Persisted list/create/update and account status behavior were skipped. |
| Staff management | Admin | BLOCKED | No authenticated Admin UI or test session; no dedicated live workflow run. |
| Customer verification | Admin | PARTIAL PASS | Schema and unauthenticated checks pass; persisted Admin verification workflow was skipped. |
| Account limits | Admin | PARTIAL PASS | Limit input validation tests pass; saving and enforcing limits against a test account was skipped. |
| Transaction review queue | Admin | PARTIAL PASS | Unauthenticated queue access is rejected; filtering and review lifecycle are covered only by the skipped database scenario. |
| Loan approval, rejection and disbursement | Admin | BLOCKED | Approval/rejection and atomic/idempotent disbursement tests are present but skipped without the dedicated test database. |
| Analytics and notifications | Admin | PARTIAL PASS | Analytics date-range validation passes. Authenticated database aggregates and live notification workflow were not tested. |
| Role-based route protection | Admin | PARTIAL PASS | Anonymous Admin dashboard redirects to login; representative protected API returns 401. Authenticated non-Admin denial was not exercised. |

## Financial Safety

| Check | Result | Evidence / limitation |
|---|---|---|
| Prevent access to another customer's data | BLOCKED | Ownership/isolation DB tests exist, but were skipped. Anonymous API access was rejected; this does not prove cross-customer isolation for signed-in users. |
| Duplicate requests do not duplicate transactions | BLOCKED | Idempotency/duplicate workflow scenarios require the skipped DB integration tests. |
| Failed operations do not partially update balances | BLOCKED | Transaction rollback and atomicity were not exercised against MongoDB. |
| Transfer, withdrawal and repayment balances remain correct | BLOCKED | No financial mutation was submitted; integration tests covering these workflows were skipped. |
| Transaction history matches balances | BLOCKED | Pure statement calculation/PDF/CSV helpers passed; no live account ledger was reconciled. |
| MongoDB transaction-capable replica-set database | BLOCKED | The running localhost health endpoint reported `database: connected`, but this does not verify that the configured deployment supports replica-set transactions. No transaction-backed test was run. |

## UI and Responsive Testing

| Check | Role | Result | Evidence / limitation |
|---|---|---|---|
| Desktop expanded/collapsed sidebar | All dashboards | NOT TESTED | Latest sidebar change (commit `2ada562`) was reviewed in `DashboardShell.tsx` and `globals.css`: the collapse control is in the sidebar header and collapsed state retains an icon rail. Actual visual/click behavior was not browser-tested. |
| Mobile navigation drawer | All dashboards | NOT TESTED | Source includes open/close controls, Escape handling, and focus handling; no viewport interaction was performed. |
| Dark/light mode | All dashboards | NOT TESTED | Theme toggle and theme CSS exist; persistence and rendered colors were not interactively checked. |
| Loading, empty, success and error states | All dashboards | NOT TESTED | No authenticated pages were exercised in a browser. |
| Forms, validation and buttons | All dashboards | PARTIAL PASS | Automated schema/API validation covers selected workflows; visual affordances, keyboard operation, and server feedback were not tested in a browser. |
| Horizontal overflow and responsive layouts | All dashboards | NOT TESTED | No browser viewport/device emulation was available. |

## Failures and Reproduction

No application failure was reproduced. The test runner itself fails when invoked directly in this environment:

1. Run `npm.cmd test` on Node.js 24.11.1 in this Windows workspace.
2. Before loading tests, Node throws `SystemError [ERR_SYSTEM_ERROR]` because `os.userInfo()` reports `uv_os_get_passwd returned ENOMEM`.
3. A temporary process-only compatibility preload allowed the existing suite to execute: 68 passed, 22 skipped, 0 failed. No repository test file or application code was changed for the workaround.

The application build updated generated `next-env.d.ts`; that generated change was restored because it was absent before the audit. Existing user changes were preserved.

## Remaining Configuration and Recommended Next Steps

1. Use dedicated synthetic Customer, Staff, and Admin accounts, then execute browser-based role workflows against a non-production environment.
2. Set `RUN_DB_INTEGRATION_TESTS=true` only when `MONGODB_TEST_DATABASE` resolves to the dedicated `banking_management_task26_test` database and the test harness confirms isolation. The local app database is `banking_management`; it is not the test database.
3. Confirm the target MongoDB deployment is a replica set or another transaction-capable topology, then run the skipped integration suite only against that dedicated test database.
4. Configure Cloudinary credentials in a safe test environment before testing avatar upload/change/removal.
5. Add browser automation or perform interactive responsive checks for desktop sidebar, mobile drawer, themes, form states, and overflow.
6. README identifies login rate limiting and server-side token revocation/invalidation as security hardening items for review before production use.

## Task 08: Database Integration Follow-up (2026-11-25)

### Skip cause and configuration

The 22 database tests were skipped because `.env` has `MONGODB_TEST_DATABASE=banking_management_task26_test` and an Atlas SRV URI, but does not enable `RUN_DB_INTEGRATION_TESTS=true`. The app database is `banking_management`. `src/lib/mongodb.ts` selects its database from `MONGODB_DATABASE` via the Mongoose `dbName` option. The integration-test setup in each applicable test file sets that variable to the configured test database after validating the dedicated database name and Atlas SRV URI. No permanent environment or application-code change was made.

The direct Node check reproduced `os.userInfo()` failing with `ERR_SYSTEM_ERROR` / `uv_os_get_passwd returned ENOMEM`. A process-only preload supplied a test-runner fallback and, as an additional safety check, rejected any Mongoose connection unless `dbName` was exactly `banking_management_task26_test`. The preload and temporary environment overrides were removed after execution; no global Node configuration was changed.

### The 22 previously skipped tests

Every test below uses `RUN_DB_INTEGRATION_TESTS !== "true"` directly or the equivalent combined gate requiring both that opt-in and a dedicated test database/Atlas SRV URI.

**`tests/user-security.test.ts` (15):**

- current user API returns active database users and rejects inactive or deleted users
- Admin can approve or reject only forwarded loans once, releases the active account key, and cannot be replaced by customer or staff requests
- Admin loan disbursement is atomic, authorized, idempotent under concurrency, and uses the approved amount
- customer loan repayments are atomic, idempotent, balance-safe, and privately paginated
- loan APIs enforce ownership and role permissions, and the database index blocks concurrent unresolved applications
- account statement API enforces customer ownership and existing staff/admin read access
- RBAC enforces dashboard roles, admin API access, active status, and database role changes
- registration API stores a customer, rejects duplicate email, and omits secrets
- login API validates credentials and status, sets an HTTP-only cookie, and omits secrets
- admin user APIs search, filter, paginate, protect credentials, and enforce update rules
- account APIs authorize roles, isolate customer data, apply status transitions, and protect balances
- transaction APIs authorize staff/admin and restrict customers to their own account transactions
- deposit workflow isolates customers and atomically approves, rejects, and rolls back requests
- withdrawal workflow protects ownership, prevents overdrafts, and atomically deducts once
- transfer workflow moves funds once, enforces ownership, and exposes each side's history

**Other test files (7):**

- `tests/profile.test.ts`: authenticated customer can read/update only their own profile; avatar replacement persists and removal clears its reference
- `tests/notifications.test.ts`: notification API isolates recipients/read updates and mark-all affects only the current customer
- `tests/customer-verification.test.ts`: Staff/Admin review and verification decisions are persisted and exposed safely
- `tests/staff-customer-registration.test.ts`: Staff creates only a Customer and duplicate email is rejected
- `tests/transaction-pin-limits.test.ts`: PIN verification, transfer limits, minimum balance and withdrawal approval are enforced in the dedicated database
- `tests/transaction-review.test.ts`: Staff review/flagging preserves financial values and Admin resolution is audited

### Enabled run and observed results

Before any write-capable run, a preflight confirmed both `MONGODB_DATABASE` and `MONGODB_TEST_DATABASE` were exactly `banking_management_task26_test`, the integration opt-in was true for that process, and an Atlas SRV URI was present. A temporary Mongoose connection guard enforced the same database name for every connection call. No production/app database was eligible for a connection.

The enabled full-suite attempt repeatedly failed in database setup. Ten integration cases reported connection failures before their workflow assertions could execute; the suite was stopped after the same connection failure recurred. The remaining 12 integration cases were not completed, so that interrupted full-suite attempt has no complete suite-wide pass/fail/skip total. Its unit-test output was also incomplete and is not counted as a full run.

A focused run of `PIN verification, transfer limits, minimum balance and withdrawal approval are enforced in the dedicated database` completed with **0 passed, 1 failed, 0 skipped**. It failed before making a database connection because MongoDB SRV DNS lookup returned `querySrv ETIMEOUT`. The full-run connection failures occurred at the same database connection stage. No integration test reached its database assertions, and these test processes created or deleted no records.

| Run | Passed | Failed | Skipped | Result |
|---|---:|---:|---:|---|
| Previous opt-in-off full suite | 68 | 0 | 22 | Completed; integration tests skipped by configuration. |
| Enabled full suite attempt | Incomplete | 10 integration connection failures observed | 12 integration cases not completed | Stopped after repeated SRV lookup timeout; no complete totals. |
| Focused PIN/limits integration run | 0 | 1 | 0 | Failed at SRV DNS lookup before database writes. |

### Financial workflow status and remaining requirement

No transfer, duplicate-request, deposit, withdrawal, loan disbursement/repayment, PIN/limit, or rollback workflow completed against MongoDB. Replica-set transaction support was not reached or verified. Those workflows remain **BLOCKED**, rather than failed business-logic tests, because the MongoDB connection could not be established.

To complete this audit, the test runner needs working DNS/network access for the configured Atlas SRV connection and permission to use the dedicated `banking_management_task26_test` database. Then rerun with process-scoped `RUN_DB_INTEGRATION_TESTS=true`, `MONGODB_DATABASE=banking_management_task26_test`, and the temporary Node workaround if `os.userInfo()` still fails. Confirm replica-set transaction capability through the integration suite. Do not place a production URI in these variables.

## সহজ বাংলা সারাংশ

Lint, typecheck ও production build সফল হয়েছে। Automated suite-এ ৬৮টি পরীক্ষা পাস করেছে, ২২টি database-নির্ভর পরীক্ষা চালানো যায়নি, কোনো automated test ব্যর্থ হয়নি। সরাসরি test command Windows-এর Node.js `os.userInfo()` ত্রুটিতে থেমেছিল; সাময়িক local workaround দিয়ে suite চালানো হয়েছে। Anonymous HTTP পরীক্ষা public page খোলা, protected page-এ login redirect এবং protected API-তে 401 নিশ্চিত করেছে।

কোনো Customer/Staff/Admin test account ব্যবহার করা হয়নি এবং কোনো টাকা-সংক্রান্ত request তৈরি বা পরিবর্তন করা হয়নি। তাই transfer, withdrawal, repayment, account ownership, duplicate request, database rollback, replica-set transaction, theme, sidebar interaction ও mobile layout-কে সফল বলা যাচ্ছে না। এগুলো dedicated test database, test role credentials এবং browser testing দিয়ে যাচাই করতে হবে। কোনো নিশ্চিত application bug এই audit-এ পুনরুৎপাদন হয়নি।

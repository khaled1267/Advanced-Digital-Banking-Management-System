# Northstar — Digital Banking Management System

A role-based digital banking management system built as a full-stack web application. Northstar provides customer banking workflows and separate tools for Staff and Admin users. It is designed as an educational/demo banking platform; it is **not connected to a real bank, payment network, or live payment gateway**.

> **Project status:** Core application features and the public landing page have been implemented. Deployment, live Cloudinary avatar uploads, and full MongoDB integration-test verification still require environment setup and end-to-end testing. Do not use this application to store real customer data or process real money.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Application Features](#application-features)
- [User Roles & Permissions](#user-roles--permissions)
- [Redux Toolkit Architecture](#redux-toolkit-architecture)
- [RTK Query Implementation](#rtk-query-implementation)
- [Authentication Strategy](#authentication-strategy)
- [Transaction Processing Logic](#transaction-processing-logic)
- [Database Structure](#database-structure)
- [Security Implementation](#security-implementation)
- [Environment Variables](#environment-variables)
- [Local Setup Instructions](#local-setup-instructions)
- [Deployment Instructions](#deployment-instructions)
- [Demo Credentials](#demo-credentials)
- [Testing & Known Limitations](#testing--known-limitations)

---

## Project Overview

**Northstar** is a digital banking management application with three user roles: Customer, Staff, and Admin. Each role receives a separate dashboard and role-appropriate access to banking operations.

The application uses the Next.js App Router for the web interface and server-side API routes. MongoDB with Mongoose stores application data. Redux Toolkit and RTK Query manage client-side application and server-data state.

### Technology Stack

| Area | Technology |
|---|---|
| Framework | Next.js App Router |
| Language | TypeScript |
| UI | React, Tailwind CSS |
| Client state | Redux Toolkit |
| API data fetching and caching | RTK Query |
| Database | MongoDB / MongoDB Atlas |
| ODM | Mongoose |
| Validation | Zod |
| Authentication | JWT in HTTP-only cookies |
| Password hashing | Argon2id |
| Charts | Recharts |
| PDF statements | PDFKit |
| Profile image storage | Cloudinary integration (credentials required) |
| Deployment target | Vercel |

---

## Application Features

### Public Website

- Public business-banking landing page at `/`.
- Responsive navigation and mobile menu.
- Product and banking feature presentation.
- Illustrative banking dashboard preview. Any displayed preview balances or transactions are sample data, not live account records.
- Customer, Staff, and Admin role overview.
- Security information and calls to action.
- Light and dark visual themes for the public landing page.

### Customer Banking

- Customer registration and login.
- Customer dashboard and account overview.
- View owned bank accounts and their status.
- Submit deposit and withdrawal requests through the application's configured approval workflow.
- Initiate eligible fund transfers.
- View transaction history.
- Apply for loans and track loan status.
- View loan repayment information and repayment history.
- Download account statements in PDF and CSV formats.
- View and edit supported profile information.
- View customer verification status, decision date, and a rejection note on the profile.
- Profile picture upload, change, and removal through the Cloudinary integration, once Cloudinary credentials are configured.
- View personal analytics and lifetime successful deposit/withdrawal totals; customer records are scoped to the authenticated account owner.
- Set or change a six-digit Transaction PIN using the current login password; the PIN hash is stored with Argon2id and is required for fund transfers.
- View account-specific transfer limits; the server checks configured limits during transfers and preserves minimum balance for customer debits.

### Staff Operations

- Register Customer accounts and assist with bank account creation.
- Search and review stored Customer information, mark pending records Verified, or Reject them with a reason.
- Verification decisions are recorded against the signed-in Staff/Admin account and cannot be changed after submission.
- Review deposit and withdrawal requests according to the configured workflow.
- Review pending deposit/withdrawal requests separately from their financial approval state; record review notes or flag a record for Admin review.
- Search transactions by ID, filter by date/type/financial status/review status/active flag, and view masked account references.
- Flag suspicious activity with a supported review category and optional explanation. A flag is a review signal, not a fraud finding.
- Review loan applications and forward them for Admin decision where the workflow requires it.
- View all-time deposit/withdrawal request counts and loan workflow counts without bank-wide transaction analytics.
- Access is restricted by Staff role permissions.

### Admin Operations

- Manage users and accounts within Admin permissions.
- Configure each account's daily transfer limit, maximum single transfer, and minimum balance; Staff can view these values but cannot change them.
- Search, filter, and review Customer verification status in the verification workspace.
- Review loan applications.
- Approve or reject loan applications.
- Handle loan disbursement workflows.
- Review banking activity and operational information.
- Search and review Staff-flagged activity, inspect Staff notes/history, and resolve or dismiss flags with an Admin note.
- View exact database aggregates for account balances and successful deposits/withdrawals, plus role-authorized charts and date filtering.

### Account Statements

- Generate PDF statements.
- Generate CSV statements.
- Apply supported account and date-range filters.
- Enforce account ownership checks for Customer requests.

### Interface Features

- Separate Customer, Staff, and Admin dashboard experiences.
- Shared dashboard shell and role-based navigation.
- Responsive desktop and mobile navigation.
- Expandable/collapsible sidebar.
- Light and dark dashboard themes with saved preference.
- Customer profile page with editable supported information.

---

## User Roles & Permissions

| Capability | Customer | Staff | Admin |
|---|:---:|:---:|:---:|
| View own dashboard | Yes | Yes | Yes |
| View own profile | Yes | Yes, subject to implemented profile access | Yes, subject to implemented profile access |
| Register customers | No | Yes | As permitted by Admin workflow |
| Create/manage customer bank accounts | No, unless a specific Customer workflow is enabled | Yes, according to Staff permissions | Yes |
| View own accounts | Yes | Not applicable as a customer action | Not applicable as a customer action |
| Submit deposit/withdrawal requests | Yes | No, unless explicitly allowed by workflow | Operational review/management |
| Review deposit/withdrawal requests | No | Yes, according to assigned permissions | Yes, according to Admin permissions |
| Initiate fund transfers | Yes, for eligible owned accounts | Not a Customer transfer action | Not a Customer transfer action |
| Apply for a loan | Yes | No | No |
| Review/forward loan applications | No | Yes | Yes |
| Approve/reject loans | No | No | Yes |
| Disburse approved loans | No | No | Yes, according to the loan workflow |
| Access another customer's private data | No | Only where required and authorized for Staff duties | Only where permitted by Admin duties |

All permissions must be enforced on the server. Hiding a button in the UI is not an authorization control.

---

## Redux Toolkit Architecture

Redux Toolkit provides the client-side state foundation. The application uses a centralized Redux store and RTK Query for API-backed data.

The architecture separates:

1. **Application state** — UI or client state that needs to be shared across components.
2. **Server state** — data retrieved from protected Next.js API routes, managed through RTK Query queries and mutations.
3. **Authentication state** — the current authenticated-user data used by the dashboard and role-aware UI.

The shared dashboard shell consumes the authenticated user and role information to display the correct navigation, profile details, and avatar. After profile updates, the relevant authentication/profile cache is refreshed so the updated information can appear without requiring a new login.

Suggested data flow:

```text
React Component
      |
      v
RTK Query Hook / Mutation
      |
      v
Next.js Route Handler
      |
      v
Authentication + Zod Validation
      |
      v
Service / Mongoose Model
      |
      v
MongoDB
      |
      v
RTK Query Cache Update / Invalidation
      |
      v
Updated React UI
```

Keep business rules and financial calculations on the server. Client state must never be treated as authoritative for balances, transaction outcomes, roles, or ownership.

---

## RTK Query Implementation

RTK Query is used for API communication and server-state caching.

Typical responsibilities include:

- Fetching the authenticated user's information.
- Fetching dashboard and account data.
- Sending profile update requests.
- Calling banking workflow endpoints.
- Caching API responses.
- Updating or invalidating relevant cached data after mutations.

For authenticated requests, the browser sends the session cookie according to the application's cookie configuration. The server independently authenticates and authorizes each request.

When adding a new API feature:

1. Define or reuse a typed RTK Query endpoint.
2. Call the endpoint from the relevant page/component.
3. Handle loading, success, empty, and error states.
4. Invalidate or update the correct cache after a successful mutation.
5. Do not calculate or trust account balances in the browser.

The current authentication API implementation includes `src/store/authApi.ts`. Follow the existing API slice and tag conventions when extending the store.

---

## Authentication Strategy

The application uses a server-validated, cookie-based JWT authentication strategy.

- Passwords are hashed with **Argon2id** before storage.
- A signed JWT is issued after successful authentication.
- The JWT is stored in an **HTTP-only cookie**, so client-side JavaScript cannot read the token directly.
- Cookie settings include secure behavior in production and `SameSite=Lax`.
- The server validates token signature and configured token claims such as expiry, issuer, and audience.
- Protected requests validate the current user and role on the server.
- The application checks that the user is still active before allowing protected access.
- The authenticated-user endpoint is used to restore the current session when the application loads.
- Logout clears the authentication cookie.

Do not store passwords, password hashes, or JWT secrets in frontend state, browser storage, source code, or public environment variables.

---

## Transaction Processing Logic

Financial operations are processed on the server. The frontend submits a request, but the server validates ownership, permissions, input, and current financial state before changing records.

### Money Representation

The project uses a BDT money utility (`src/lib/bdt-money.ts`) to avoid ordinary floating-point arithmetic for financial calculations. Amounts are handled in integer minor units (paisa) in application calculations, while MongoDB financial values use Decimal128 where configured by the models.

Do not use JavaScript floating-point arithmetic as the source of truth for balances or transaction amounts.

### Fund Transfer

The transfer workflow is designed to:

1. Authenticate the sender.
2. Verify sender-account ownership and eligibility.
3. Validate the recipient account and transfer amount.
4. Check balance and applicable business rules.
5. Debit the sender and credit the recipient atomically using MongoDB transaction support.
6. Create the related transaction records.
7. Apply idempotency protection to prevent duplicate processing of the same request.
8. Return a result only after the operation has completed successfully.

If a required operation fails inside the database transaction, the transaction should roll back rather than leave only one side of the transfer updated.

### Deposits and Withdrawals

Deposit and withdrawal requests follow an approval workflow. A request should not be represented as completed merely because a Customer submitted it. The applicable Staff/Admin action and the corresponding server-side financial operation determine the final state.

- Deposit approval must update the applicable account/transaction state according to the existing workflow.
- Withdrawal rejection must not debit the Customer's account.
- Repeated approval/rejection requests must not process the same request more than once.

Staff review state is stored independently from the financial status. Starting or completing a review, adding notes, or flagging a transaction/request does not update its amount, account balance, deposit/withdrawal decision, or transaction status. Flagged items use a separate Admin workflow and append review history; resolving a flag does not reverse or freeze the original financial record.

### Loans and Repayments

The loan workflow includes an application with type, requested amount, duration, monthly income, employment status, and description; Staff review; Admin approval/rejection; disbursement; and repayment history. Supported application types are Personal, Education, Home, Business, Medical, and Other. Employment details are collected for review and do not automatically determine eligibility.

Loan approval and loan disbursement are different events. An approved loan should not be described as disbursed until the disbursement operation has actually completed.

Disbursement atomically credits the approved principal, records the disbursement, and creates one persistent monthly installment per approved month. Northstar currently has no configured interest policy, so the schedule is principal-only and records zero interest; each amount is split in exact paise, with any remainder added to the final installment. Due dates are anchored to the disbursement day and clamped to each month's last calendar day.

Repayments continue through the existing atomic loan repayment operation. Each payment is allocated oldest-installment-first and updates installment amount paid, remaining amount, status, and payment timestamps in the same MongoDB transaction as the account debit, loan balance, transaction, and repayment history. Overdue status is derived from the due date and remaining amount when details are read; it needs no background scheduler. Existing loans without installment records retain their repayment history and display that no schedule is available; no historical installments are fabricated.

### Transaction Types and Statuses

The application has used transaction types including:

- Deposit
- Withdrawal
- Fund Transfer
- Loan Disbursement
- Loan Repayment

Transaction status values include:

- Pending
- Completed
- Failed
- Reversed

Use the model enums and backend validation as the source of truth if these values are updated in the codebase.

---

## Database Structure

MongoDB is accessed through Mongoose. The logical data entities in the application include:

| Entity | Purpose |
|---|---|
| User | Authentication identity, role, active status, and supported profile fields |
| Account | Customer-owned bank account details, account type, status, and balance |
| Transaction | Financial activity and transaction status/type |
| Deposit / Withdrawal workflow records | Requests and approval/rejection state, following the existing model design |
| TransactionReview | Review state and append-only Staff review history associated with a transaction or pending request |
| SuspiciousTransactionFlag | Reason, Staff attribution, Admin review state, and history; one active flag per target |
| Loan | Loan application, review, decision, disbursement, and outstanding balance data |
| LoanInstallment | Persisted monthly due dates, principal/interest snapshot, paid and remaining amounts, and payment status |
| Loan repayment records | Repayment history and related loan/account references |
| Notification | Persistent customer notifications with read state and event deduplication |

The exact MongoDB collection names are determined by the Mongoose model definitions and may differ from the logical names above. Inspect `src/models` before writing scripts or querying collections directly.

### Database Configuration

The project has used these database names during development:

- Development/application database: `banking_management`
- Dedicated integration-test database: `banking_management_task26_test`

Set the values through environment variables. Never run tests against a production database. MongoDB transactions require a deployment topology that supports replica-set transactions; MongoDB Atlas supports this when the cluster is configured appropriately.

---

## Security Implementation

Security measures implemented in the application include:

- Argon2id password hashing.
- Signed JWT authentication in HTTP-only cookies.
- Secure cookie behavior in production and `SameSite=Lax`.
- Server-side authentication and role checks.
- Active-user validation on protected requests.
- Zod request validation.
- Customer account ownership checks.
- Server-side financial calculations and balance validation.
- MongoDB transaction use for supported atomic financial workflows.
- Idempotency protections for supported financial operations.
- Pagination limits and input validation in supported endpoints.
- Sensitive credentials kept in environment variables rather than source code.
- Cloudinary server-side signing for profile-image uploads; API secrets remain server-side.

### Security Limitations to Review

The prior security review identified areas that require further hardening, including login rate limiting and server-side JWT revocation/invalidation. A signed token may remain usable until its expiry unless the application has an additional revocation mechanism. Review these controls before any production use.

This project is an educational/demo application and has not been independently security-certified or approved by a financial regulator.

---

## Environment Variables

Create a local `.env.local` file in the project root. Never commit real credentials.

| Variable | Required | Description |
|---|:---:|---|
| `MONGODB_URI` | Yes | MongoDB connection URI. Keep credentials private. |
| `MONGODB_DATABASE` | Yes | Application database name; development has used `banking_management`. |
| `MONGODB_DEMO_URI` | For demo seeding | Separate MongoDB connection reserved for demo data; the seed command never uses `MONGODB_URI`. |
| `JWT_SECRET` | Yes | Strong, private secret used by the authentication implementation. |
| `MONGODB_TEST_DATABASE` | For integration tests | Dedicated test database; development has used `banking_management_task26_test`. |
| `RUN_DB_INTEGRATION_TESTS` | Optional | Set to `true` to opt in to database-backed tests; those tests also require a dedicated test database name. |
| `CLOUDINARY_CLOUD_NAME` | For profile image storage | Cloudinary cloud name. |
| `CLOUDINARY_API_KEY` | For profile image storage | Cloudinary API key. |
| `CLOUDINARY_API_SECRET` | For profile image storage | Cloudinary API secret. |

Example template (replace placeholders with your own values):

```env
MONGODB_URI="mongodb+srv://<username>:<password>@<cluster-host>/"
MONGODB_DATABASE="banking_management"
# Configure only for demo seeding, using a demo-only MongoDB deployment.
MONGODB_DEMO_URI="mongodb+srv://<demo-user>:<demo-password>@<demo-cluster-host>/"
MONGODB_TEST_DATABASE="banking_management_task26_test"
RUN_DB_INTEGRATION_TESTS="false"
JWT_SECRET="<generate-a-long-random-secret>"

# Required to enable persistent profile-picture uploads
CLOUDINARY_CLOUD_NAME=""
CLOUDINARY_API_KEY=""
CLOUDINARY_API_SECRET=""
```

Notes:

- Use the actual variable names expected by the current source code and `.env.example`.
- Do not paste secrets into README files, chat messages, screenshots, or Git commits.
- Use a separate database for integration tests.
- PIN lockout counters are stored in MongoDB per Customer. Five incorrect PIN attempts in a rolling 15-minute window temporarily block transfer authorization for 15 minutes; a successful check or a password-authorized PIN change clears the counter.
- No bank-wide financial default limits are configured. Existing and newly opened accounts remain usable with their existing behavior until an Admin sets account-specific limits; missing single/daily limits mean no additional cap, and missing minimum balance is treated as BDT 0.00.
- Set `RUN_DB_INTEGRATION_TESTS=true` only when `MONGODB_TEST_DATABASE` points to the dedicated test database.
- Configure the same required variables in Vercel Project Settings for each deployment environment.
- Cloudinary avatar code requires valid Cloudinary credentials before live upload/change/remove can be verified.
- `.env.example` contains placeholders only. Transaction PIN hashes and attempt limits use the configured MongoDB database; no PIN secret environment variable is required.

---

## Local Setup Instructions

### Prerequisites

- Node.js version compatible with the project's `package.json` (the development environment has used Node.js 24.x).
- npm.
- A MongoDB deployment that supports the database operations used by the project. Use a dedicated development database.
- Cloudinary account and API credentials if you want to test persistent profile-picture uploads.

### 1. Clone the Repository

```bash
git clone <YOUR_GITHUB_REPOSITORY_URL>
cd "Bank management system"
```

Replace the repository URL with the actual GitHub repository URL.

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create `.env.local` in the project root and add the required values described in [Environment Variables](#environment-variables).

Do not use production database credentials for local development or tests.

### 4. Start the Development Server

```bash
npm run dev
```

Open:

- Public website: `http://localhost:3000/`
- Login: `http://localhost:3000/login`
- Registration: `http://localhost:3000/register`
- Customer profile: `http://localhost:3000/profile` (Customer authentication required)

Other dashboard and API routes are protected according to their role and authentication requirements.

### 5. Run Quality Checks

Use the scripts available in `package.json`:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

If a script is not defined in the current `package.json`, use the available script name shown by:

```bash
npm run
```

### 6. Test Database Safety

Before running integration tests:

1. Confirm `MONGODB_TEST_DATABASE` points to a dedicated test database.
2. Confirm the test setup cannot fall back to the development or production database.
3. Use test-only users and accounts.
4. Never run destructive cleanup against real banking data.

---

## Deployment Instructions

The application is designed for deployment on Vercel. The deployment has not been confirmed as completed in the project status available for this README.

### 1. Push the Project to GitHub

Commit and push the reviewed project changes using your normal Git workflow. Before pushing, inspect the changes and confirm that `.env.local` and all real secrets are excluded by `.gitignore`.

### 2. Import the Repository into Vercel

1. Open [Vercel](https://vercel.com/).
2. Create or select a Vercel project.
3. Import the correct GitHub repository.
4. Confirm the Next.js framework settings and project root directory.
5. Add the required environment variables in **Settings → Environment Variables**.

### 3. Configure MongoDB Atlas

- Use a dedicated application database for the deployment.
- Configure Atlas network access securely for the deployment environment.
- Ensure the cluster topology supports transactions used by the application.
- Do not use the test database for production traffic.

### 4. Configure Cloudinary

Add the following environment variables in Vercel if profile image uploads are required:

- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

Keep the API secret server-side. Redeploy after changing environment variables.

### 5. Deploy and Verify

After deployment:

1. Check the public landing page.
2. Check login and registration.
3. Verify each role's protected dashboard with its own test account.
4. Verify profile update and avatar persistence if Cloudinary is configured.
5. Test banking workflows only with isolated demo/test accounts and a non-production test environment.
6. Review Vercel logs and browser console for errors.

Use a Preview Deployment for initial verification. Do not test financial operations against real customer accounts or production data.

---

## Demo Credentials

These public demo credentials are for the dedicated `banking_management_demo` database only. They are not production credentials and must never be reused for real accounts.

| Role | Demo Email | Demo Password | Provisioning |
|---|---|---|---|
| Admin | `admin.demo@northstar.test` | `Demo-Admin-2026-Northstar!` | `npm run seed:demo` |
| Bank Staff | `staff.demo@northstar.test` | `Demo-Staff-2026-Northstar!` | `npm run seed:demo` |
| Customer | `customer.demo@northstar.test` | `Demo-Customer-2026-Northstar!` | `npm run seed:demo` |

### Create or verify the demo accounts

1. Configure `MONGODB_DEMO_URI` with credentials for a MongoDB deployment reserved for demo data. Do not point it at a production deployment. When you run the app to log in, configure its `MONGODB_URI` and `MONGODB_DATABASE` to use that same demo deployment and database.
2. From the project root, select the dedicated database and explicitly confirm the seed. The script uses only `MONGODB_DEMO_URI` and rejects production mode, any database name other than `banking_management_demo`, and any run without the confirmation value.

PowerShell:

```powershell
$env:MONGODB_DATABASE = "banking_management_demo"
$env:MONGODB_DEMO_URI = "<demo-only MongoDB connection URI>"
$env:DEMO_SEED_CONFIRMATION = "CREATE_NORTHSTAR_DEMO_ACCOUNTS"
npm.cmd run seed:demo
Remove-Item Env:DEMO_SEED_CONFIRMATION
```

Bash:

```bash
MONGODB_DATABASE=banking_management_demo MONGODB_DEMO_URI="<demo-only MongoDB connection URI>" DEMO_SEED_CONFIRMATION=CREATE_NORTHSTAR_DEMO_ACCOUNTS npm run seed:demo
```

The command only creates missing demo identities. It checks every existing demo email before writing; a conflicting record or password stops the run without changing existing records. Passwords are stored as Argon2id hashes. After seeding, start the application against the same dedicated database and sign in at `/login` with each row above. The Admin, Staff, and Customer roles are returned by the normal login flow and control access through the existing server-side authorization checks.

Do not publish these credentials as access to a live deployment. Anyone who can see this README can use the demo accounts in the dedicated demo database.

**Before sharing demo access:**

- Use only test data and a dedicated demo database.
- Do not reuse personal, production, or administrator passwords.
- Do not grant elevated roles through an untrusted client request.
- Do not commit real credentials to GitHub. For public repositories, provide demo access through a controlled channel or a secure demo environment.
- If demo credentials are not available, replace the placeholders with a clear instruction explaining how reviewers can request or create access.

---

## Testing & Known Limitations

Latest verified checks for this audit:

- `npm.cmd run lint`: passed.
- `npm.cmd run typecheck`: passed.
- `npm.cmd run build`: passed; Next.js generated all 61 static pages.
- `git diff --check`: passed.

The configured test command contains 90 tests and subtests across user-security, profile, notifications, analytics range validation, Staff customer registration, customer verification, transaction review/flagging, and Transaction PIN/account limits. A direct invocation currently fails before loading tests because Node.js 24 `os.userInfo()` returns `uv_os_get_passwd` / `ERR_SYSTEM_ERROR` in this Windows environment. With a temporary runner-only preload that supplies the missing username, 68 tests passed, zero failed, and 22 database-backed tests were skipped because `RUN_DB_INTEGRATION_TESTS` is false. Node's SRV and TXT DNS lookups for the configured Atlas host currently return `ETIMEOUT`; the MongoDB driver therefore cannot reach server selection, TLS, authentication, database selection, or transaction initialization. No successful MongoDB integration test is claimed. MongoDB integration behavior, PIN lockout, concurrent transfer limits, and live financial workflows are not verified by lint, type checking, or a successful build.

Additional items requiring configuration or verification:

- Cloudinary environment variables must be configured before real profile-image upload/change/remove can be tested.
- MongoDB Atlas connectivity and transaction-capable integration testing must be verified in the target environment.
- Live Vercel deployment and Preview/Production environment variables must be configured and tested.
- Demo credentials must be created for all three roles and inserted into the table above before distribution.
- Login rate limiting and token revocation/invalidation should be reviewed and strengthened before any production deployment.
- This project does not implement per-transaction fees, automated suspicious-activity detection, a loan repayment schedule, or PDF transaction receipts. Staff can manually flag transactions and pending requests for Admin review. Account statements are available as PDF and CSV exports.

---

## Important Disclaimer

Northstar is an educational/demo banking management project. It does not provide real banking services, connect to payment rails, or authorize real deposits, withdrawals, or transfers. Use synthetic accounts and test data only. Do not enter real customer information, card details, financial credentials, or production banking data.

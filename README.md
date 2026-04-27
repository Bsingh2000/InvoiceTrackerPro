# Invoice Tracker Pro

Invoice Tracker Pro is a Next.js invoice operations dashboard for managing receivables, payables, payment deadlines, alerts, and financial reporting from one workspace. It uses Supabase for authentication, workspace-backed invoice records, payments, tags, counterparties, and private invoice attachments.

## What the Application Does

The application gives finance users a single place to track money owed by customers and money owed to vendors. It supports creating invoices, monitoring open balances, prioritizing overdue items, planning payment deadlines, reviewing cash movement, and exporting invoice data.

It is organized around the day-to-day workflow of invoice operations:

- Track customer invoices to collect payment on time.
- Track vendor invoices and plan outgoing payments.
- See which invoices are overdue, due today, due soon, paid, partially paid, or cancelled.
- Record full and partial payments.
- Review invoice aging, outstanding balances, and upcoming cash movement.
- Use calendar, alert, dashboard, and analytics views to decide what needs attention next.
- Preview and test-send a month-end invoice summary email.
- Send month-end summaries to the workspace business email automatically on the last local day of the month.

## Main Features

### Dashboard

The dashboard summarizes the current invoice portfolio with operational metrics and action items:

- Total invoice count.
- Open receivables and payables.
- Overdue balances.
- Amount due this week.
- Paid amount for the current month.
- Urgent invoice queue ordered by due date and priority.
- Recent activity and cash movement charts.
- Forecast and aging panels for upcoming receivables and payables.

### Invoice Ledger

The ledger is the central list of all invoice records. Users can:

- Search invoices by invoice number, party name, category, reference number, notes, and tags.
- Filter by invoice type, status, priority, date range, and common quick filters.
- Sort by due date, invoice total, balance, party name, or status.
- Export filtered invoices as CSV.
- Open invoice detail pages.
- Mark invoices as paid.
- Queue reminder actions.
- Archive invoices from the active ledger.

### Invoice Creation

The add-invoice flow supports both receivables and payables. It includes:

- Receivable or payable selection.
- Auto-generated invoice numbers.
- Customer or vendor details.
- Invoice amount, currency, issue date, due date, and payment terms.
- Status and priority.
- Partial payment entry.
- Payment method, reference number, category, notes, internal remarks, tags, reminders, and recurring invoice metadata.
- Invoice attachment upload to private Supabase Storage.
- A live summary panel showing balance remaining and payment progress.
- Validation warnings for date and payment issues.

### Invoice Detail

Each invoice has a detailed record view with:

- Balance remaining and payment progress.
- Status, priority, type, aging, and due-date context.
- Invoice information, payment details, operational metadata, notes, tags, and attachment references.
- Quick actions for marking paid, recording partial payments, sending reminders, duplicating invoices, exporting a JSON record, reopening paid invoices, editing status or priority, and archiving.
- A local activity timeline built from sample events and invoice state.

### Receivables Workspace

The receivables page focuses on customer collections:

- Open receivables, overdue balances, due-soon totals, and collected-this-month totals.
- Aging buckets for collection risk.
- Collection queue with suggested next actions.
- Customer ledger with receivable-specific filters and export.
- Focused lists for overdue, due-soon, and recently paid invoices.

### Payables Workspace

The payables page focuses on vendor obligations:

- Open payables, overdue bills, bills due in the next seven days, and disbursed-this-month totals.
- Payables aging overview.
- Payment queue with approval, scheduling, payment, and proof-upload style workflow states.
- Vendor ledger with payable-specific filters and export.
- Focused lists for overdue, due-soon, and recently paid payables.

### Calendar

The calendar helps plan due dates and cash timing:

- Month, week, and agenda views.
- Filters for collect, pay, overdue, large value, and current-week items.
- Due-today, due-this-week, overdue, and due-this-month summary cards.
- Overdue carry-forward ribbon so overdue invoices stay visible.
- Material cash movement panel for large open balances.
- Quick actions to send reminders, schedule payments, or record payment.

### Alerts

The alerts page turns invoice deadlines into a triage queue:

- Overdue, due-today, due-tomorrow, due-soon, and large-value alert rules.
- Alert filters for collect, pay, critical, dismissed, and timing groups.
- Sorting by priority, overdue age, amount, newest, or oldest.
- Bulk actions for review, snooze, resolve, and dismiss.
- Alert detail panel with next action guidance.
- Local alert workflow state stored in the browser.

### Analytics

The analytics workspace provides reporting and drill-through views:

- Date range controls for last 30 days, last 90 days, last 12 months, and custom ranges.
- Cash-basis and invoice-basis analysis.
- Amount and count views.
- Type and status filtering.
- Net cash movement, overdue exposure, average payment delay, and average payment terms.
- Monthly trend and exposure charts.
- Status mix and aging/timing distribution.
- Customer and vendor concentration panels.
- Evidence-based insights with linked invoice drill-through.
- CSV export for the current analytics scope.

### Settings and Email Tools

Settings manage workspace behavior and demo controls:

- Business name and finance contact.
- Base, reporting, and supported currencies.
- Payment terms, timezone, date format, invoice prefix, default status, default priority, and reminder defaults.
- Alert thresholds and export preferences.
- Invite-only user management for workspace admins.
- Saved-view and local workflow reset controls.
- Demo data reset.
- Month-end summary preview and owner-delivery test-email tooling.

The month-end email tool builds a summary of open receivables and payables grouped by currency, current items, and overdue items. Preview works inside the app. Manual test sending now uses the saved workspace business email automatically. Automatic month-end delivery runs from a Vercel Cron route and records send results in `email_send_logs`.

## Data and Persistence

This build uses Supabase for the main finance data:

- Supabase Auth handles sign in for invited users.
- Workspace owners and admins invite users from Settings with a full name, email address, and role.
- New users receive a Supabase invite email, set a password, then sign in.
- Users without a workspace membership cannot access the app.
- Invoices are stored in the `invoices` table.
- Customer and vendor names are stored in `counterparties`.
- Tags are stored in `invoice_tags`.
- Payment records are stored in `invoice_payments`.
- Attachment metadata is stored in `invoice_attachments`.
- Attachment files are uploaded to the private `invoice-attachments` Supabase Storage bucket.
- The database schema lives in `supabase/migrations/20260420182645_initial_invoice_tracker_schema.sql`.

Some workflow preferences still use browser storage:

- Alert workflow state is stored in `localStorage` under `invoice-tracker:alert-workflow`.
- Workspace settings UI state is stored in `localStorage` under `invoice-tracker:workspace-settings`.
- Sidebar and saved-view preferences are stored in the browser.

The Settings demo reset can repopulate the active workspace with the sample invoice dataset from `lib/mock-data.ts`.

## Tech Stack

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- React Hook Form
- Zod
- Recharts
- date-fns
- Lucide React icons
- Supabase Auth, Postgres, Row Level Security, and Storage
- MailerSend API integration for test email sending

## Getting Started

Install dependencies:

```bash
npm install
```

Create `.env.local` with the Supabase and email values:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
SUPABASE_SERVICE_ROLE_KEY=your_server_only_service_role_key
APP_BASE_URL=https://your-production-domain.com
email_api_key=your_mailersend_token
MAIL_FROM_EMAIL=verified-sender@example.com
MAIL_FROM_NAME=Invoice Tracker Pro
CRON_SECRET=your_random_vercel_cron_secret
```

`SUPABASE_SERVICE_ROLE_KEY` is required only for trusted server routes. Never prefix it with `NEXT_PUBLIC_`. `APP_BASE_URL` controls the domain used in invite emails, so production should use the deployed site URL instead of localhost. `CRON_SECRET` secures the automated Vercel cron request.

Apply the Supabase schema migration to a linked project:

```bash
supabase db push
```

Run the development server:

```bash
npm run dev
```

Open the local URL printed by Next.js, usually:

```text
http://localhost:3000
```

Build for production:

```bash
npm run build
```

Start the production build:

```bash
npm run start
```

Run linting:

```bash
npm run lint
```

## Email Configuration

Supabase Auth generates secure invite links, and the app sends the workspace invite email through MailerSend. For production, set `APP_BASE_URL` to the deployed site and add the app callback URL to the Supabase Auth redirect URLs:

```text
http://localhost:3000/auth/callback
https://your-production-domain.com/auth/callback
```

Workspace invites and test sending through MailerSend require these environment variables in `.env.local` and in the deployment environment:

```bash
APP_BASE_URL=https://your-production-domain.com
email_api_key=your_mailersend_token
MAIL_FROM_EMAIL=verified-sender@example.com
MAIL_FROM_NAME=Invoice Tracker Pro
CRON_SECRET=your_random_vercel_cron_secret
```

The email code also checks `EMAIL_API_KEY` as an alternate token variable name.

MailerSend requires the sender domain or email to be verified before messages can be accepted.
Vercel Cron automatically includes `Authorization: Bearer <CRON_SECRET>` when `CRON_SECRET` is set in the project environment.

## Project Structure

```text
app/                         Next.js routes and API endpoints
components/                  UI, layout, invoice, dashboard, calendar, alert, and analytics components
lib/                         Types, formatting, validation, analytics, mock data, and email helpers
lib/email/                   Month-end summary builder, renderer, and MailerSend integration
```

Key routes:

```text
/dashboard                   Main invoice operations dashboard
/invoices                    All-invoice ledger
/invoices/new                Invoice creation
/invoices/[id]               Invoice detail
/receivables                 Customer collection workspace
/payables                    Vendor payment workspace
/calendar                    Due-date planning
/notifications               Alert triage
/analytics                   Reporting and drill-through analytics
/settings                    Workspace settings and email tools
```

## Current Limitations

- Invoice records, payments, tags, counterparties, and attachment metadata are stored in Supabase. Settings and alert view state still use browser storage.
- User access is invite-only in the app. Also disable public signups in Supabase Auth settings for defense in depth.
- Reminder, payment scheduling, approval, hold, and proof-upload actions are UI workflow placeholders unless connected to external services.
- Invoice attachments are uploaded on invoice creation. Editing or replacing attachments after creation is not built yet.
- Email delivery depends on MailerSend credentials, a verified sender, and a configured workspace business email.
- Automatic month-end scheduling depends on Vercel Cron and `CRON_SECRET` being configured in the deployment environment.

## Deployment

The project includes a Vercel configuration and can be deployed as a standard Next.js application. Set the Supabase public URL, Supabase publishable key, server-only Supabase service-role key, MailerSend variables, and `CRON_SECRET` in the deployment environment.

# Theory

A local React + TypeScript foundation for the Theory marketing platform, built with Vite and Lucide icons.

## Run locally

```sh
npm install
npm run dev
```

Open the Local URL printed by Vite. `npm run build` checks TypeScript and builds production assets into `dist/`.

## Stage one

- Personal dashboard with metrics derived from shared task and campaign records.
- Planner filters, task creation/editing/deletion, due dates, priorities and completion.
- Campaign creation, cards, status boards and campaign task views.
- Shared task updates across planner, dashboard, campaigns and calendar.
- Editable campaign budgets, global search, light/dark appearance and responsive navigation.
- Browser storage persists this device's data; seeded example records are included.

Company notes now use server accounts, company membership and permission checks. Tasks and campaigns remain browser-local. Billing, broader workspace permissions, integrations, file uploads and advanced discipline tools are not implemented. Navigation for future modules is clearly marked. Do not use browser storage for sensitive production data.

## Architecture

Domain records are typed in `src/main.tsx`. Campaign relationships use stable IDs. Tasks and campaigns use browser storage; company accounts and company notes use a server-authorised API with SQLite.

## Navigation
The primary navigation starts expanded. Selecting a section opens an icon rail and contextual secondary panel. All sections restores the expanded menu. The List and Inbox keep their existing internal view IDs and shared records. My Work is the parent section under My Dashboard, containing Overview, Inbox, Calendar, The List and Notes & Ideas. Discipline navigation is searchable, campaign links use existing IDs, and mobile navigation opens as a dismissible drawer. The discipline directory currently includes all 55 planned disciplines; organisation-specific activation is a later stage.

## My Work & The List

The List (existing internal My Planner view) defaults to open tasks across all dates. Create groups and one level of subgroups, assign tasks through the editor, and filter by group or discipline. Selecting a parent group includes its subgroups. Removing a group keeps its tasks in Ungrouped.

Repeat rules support daily, weekdays, weekly with selected weekdays and week intervals, monthly, annually, and every N days/weeks/months/years. Completion creates a completed occurrence and advances the same active task record from its scheduled due date, preserving its campaign, discipline and group. Missed dates are not silently skipped. Month-end rules preserve the original day where possible (31 January → 28 February → 31 March). Completed recurring occurrences are historical records; their checkbox does not reopen the series. Set Repeat to Does not repeat to stop future recurrence.

Run `npm test` for date and completion checks (Node 24 or later). Browser storage remains local to this device.

Task setup asks whether a marketing discipline and campaign apply. Yes reveals a required picker; No removes that association on save. Disciplines are grouped by category. Campaign choices use current workspace campaigns, retaining a previously linked completed campaign when editing. Group assignment uses a hierarchical picker with parent groups and indented lists.

## Notes & Ideas
Notes & Ideas is a separate page within My Work under Personal Management. Notes support titles, multiline text, custom categories, comma-separated tags and five muted colours. Search and category/tag filters help organise them. Notes persist in browser storage and synchronise between tabs of this local app. Share prepares a text snapshot that can be copied or downloaded as a .txt file; it does not grant access to the workspace or offer shared editing. Company sharing is implemented through the local backend described below.

## Company note sharing

Node 24+ is required. Vite dev and preview load `server/company-api.mjs` through `vite.config.mjs`. Accounts and company notes persist in `.data/theory.sqlite`, which is ignored by Git; keep this data directory when restarting and include it in your backup plan. No account passwords or invitation codes are written to source files.

In Notes & Ideas, choose Set up / sign in → Create company. A company owner can create a single-use, email-specific invitation code in Company & team. Teammates choose Join company using their email and code. Invite codes expire after seven days and must be sent by the owner; no email is sent automatically. One account can belong to multiple companies.

Company notes are private to the creator until Share → select company members → Save company access. Recipients can read, copy or download the note, but cannot edit, delete or change its access. Unticking a recipient and saving revokes their access. Other companies cannot read or be granted access to the note. Shared note lists refresh on focus and every 15 seconds while visible. Device notes remain local; Save a company copy explicitly copies one into the account before sharing.

Sessions use random tokens stored hashed in SQLite and HttpOnly, SameSite cookies; passwords use salted scrypt. HTTPS sessions also set Secure. Mutations validate request origin and membership on the server. Note edits check versions to avoid stale overwrites. Tests use an isolated in-memory database and verify cross-company denial, read-only recipients, revocation, invitation restrictions, login/logout, validation and stale updates. Run `npm test`.

The current server binds to loopback for local development. Colleagues on other devices need the same server deployed to an HTTPS host with persistent storage. A static-only upload of `dist/` cannot run the company API. Password recovery, email verification, two-factor authentication, audit history and production deployment remain future work. Task, campaign, budget and group records are separated by selected workspace in browser storage; they are not yet synchronised to other team members through the server.

## Workspace switcher

The sidebar workspace card opens a dropdown for Personal space, linked companies, Add a company, Join with an invitation, and account sign-in. Company creation links another workspace to the same account. Existing-account invitations can be redeemed without creating a second account. The server verifies membership when switching and keeps the active company in the session. Legacy accounts are migrated to membership records without deleting accounts, notes or sessions.

Personal space is available without a company. Personal tasks, campaigns and groups remain local to this browser. Signed-in personal space is scoped to the user; company-local work is scoped to the user and company. Signing up from the workspace menu preserves a copy of existing device work in the new account’s personal space without uploading it. Company notes retain server-side company access checks. Switching resets view filters, and each company shows only its own saved work.


### Workspace nicknames
The workspace dropdown includes Manage workspaces. Personal space and each linked company can have a private display nickname (up to 60 characters). Account nicknames are saved on the server per user/membership and remain separate from canonical company names. Guest personal-space names stay in browser storage. Clearing a nickname restores the original name. The active nickname appears in the sidebar, workspace picker and breadcrumb. No workspace IDs or work records change when naming a workspace.

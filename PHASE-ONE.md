# Phase 1 — review guide

Implemented in the existing task, planner, overview and organisation services. Phase 2 has not been started.

## What changed

- **Task details:** assignable subtasks, followers, optional actual hours, typed custom fields, private/shared templates and committed-deadline locks. Parents wait for open subtasks; combined parent/dependency cycles are rejected. Child visibility inherits its parent’s restrictions.
- **Dependencies:** Gantt dependency flow with connectors, milestone indicators, conflicts and linked task details. A forward-reschedule preview lists every changed start/deadline. Applying requires explicit confirmation and current permissions/versions. Publication dates, campaign dates and planned work dates remain unchanged. Locked deadlines stop cascades.
- **Workload:** weekly/day and monthly/week timelines; organisation, brand, campaign and discipline breakdowns; configurable hours/days/unavailability; optional capacity pools by brand/discipline. Managers redistribute work through the same task drawer. Multiple-brand estimates are divided evenly for breakdown totals; contributors do not multiply effort.
- **Collaboration/views:** authorised follower notifications, existing comments/mentions/history, exact status filters, scheduled-work/deadline ranges and manager-published shared views. Views and mentions never grant task access.
- **Import:** reusable spreadsheet parser and scoped preview/job pipeline, initially for tasks. CSV and modern Excel (.xlsx), automatic column suggestions, manual mapping, source sample, company/brand assignment, owner/campaign resolution, validation, duplicate warnings, confirmation and row results. Creates new canonical tasks only; never overwrites records.
- **Interface:** advanced tools stay collapsed in The List; details are progressive disclosures. Import, capacity and task dialogs render above page containers, remain scrollable and manage keyboard focus.

## Try it

1. Open **My Work → The List**. Open a task → **Subtasks, followers, custom fields & templates**. Add a subtask, set its owner/dates in the existing details section and save. Try completing the parent before its child.
2. Add custom fields, optionally record actual hours, or save the task as a template. Use that template from **The List → Advanced tools**. Managers can publish shared templates and views; ordinary members can save private ones.
3. Link a creative brief → artwork → sign-off sequence through **Effort, prerequisites & publication**. Open **Marketing Overview → Gantt** to see its dependency flow. In a task, open **Preview dependent deadline changes**, review the list and explicitly confirm. A committed deadline must be unlocked and saved separately before it moves.
4. Open **My Work → Workload**. Choose Monthly and a breakdown. Use Capacity to set hours, working days, days off and optional pools. Estimate 55 hours in a 37.5-hour week to see the overallocation warning. Open any listed task to reassign/reschedule it.
5. In **The List → Filters**, select exact status and work/deadline ranges, then save a private or authorised shared view. Existing bulk edits retain their preview and 15-minute version-safe undo.
6. Open **The List → Advanced tools → Import Excel / CSV**. Map columns and choose company/brands/date format. Validate before confirming. Invalid rows require correction or an explicit “valid rows only” selection. Duplicate rows are skipped unless explicitly allowed as new copies.

## Deliberate limits

- Import: up to 4 MB, 1,000 data rows, 80 columns and 20 sheets; extracted XML/data and parsing time/memory are bounded. Older `.xls` files must be saved as `.xlsx`. Formulas are not evaluated; mapped formula/unsupported cells must be replaced with values. Pending jobs expire after 30 minutes. Cancellation discards the pending upload, never tasks already imported.
- Duplicate matching uses title, owner, campaign and deadline within accessible records. Allowing duplicates creates fresh copies; there is no destructive update mode.
- Dependency rescheduling supports dated, open, non-recurring task sequences with one calendar-day separation. It only pushes conflicting successors forwards. Recurring prerequisites/occurrence bindings and lag/lead are outside this release. Previews expire after 10 minutes and are invalidated by task changes. Cross-workspace dependencies are prohibited.
- Capacity uses recorded task estimates and spans, not equal task counts. Future recurring instances are not forecast. Actual hours are optional manual totals on tasks, not a timer or dated timesheet. Company team totals exclude other-company and inaccessible private work.
- Task templates reuse content/checklists/fields/effort without copying stale dates, discussions, attachments or followers. Subtask trees are not duplicated automatically.

## Verification

`npm test` covers existing behaviour plus combined cycles, blocked completion, subtask privacy, follower/brand access revocation, shared-view/template roles, confirmed rescheduling, unchanged commitments, stale previews, undo, monthly capacity, quoted CSV, Excel dates/formulas, invalid and duplicate imports, atomic rollback after access revocation, and real SQLite restart persistence.

`npm run build` checks TypeScript and creates the production bundle. The existing large-bundle advisory remains. Excel parsing stays on the server in a bounded worker; it is not bundled into the browser. The dependency audit reported zero vulnerabilities after pinning ExcelJS’s compatible patched UUID dependency.

Browser review checked the planner tools, import dialog, monthly workload/discipline breakdown, availability/pool controls and advanced task drawer. No real tasks or capacity settings were changed in these checks; populated mutations were tested against isolated databases.

GitHub backups cover source. User records, uploads and local keys remain outside Git and need their own secured operational backup.

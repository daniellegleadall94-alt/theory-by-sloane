# Marketing operating system: implementation audit and backlog

Reviewed 28 October 2026 against the Competitive Feature Expansion brief. This is a progressive roadmap. Existing working modules remain in place; the first release extends the canonical task records rather than adding a parallel planner.

## Existing foundation

| Area | Implementation and limits |
| --- | --- |
| Organisations and brands | Memberships, roles, business grants, personal/company separation, company switching and All My Work. One subdivision level; deeper hierarchies remain future work. |
| Personal planning | Lists/groups, My Day, My Week, importance, planned dates independent of deadlines, reminders, accountable owner and contributors, attachments and checklists. Checklists are not separately assignable subtasks. |
| Connected scheduling | Marketing Overview list, board, channel timeline, campaign/project Gantt and calendar reuse task dates/status. Drag/resize updates tasks; no automatic cascading dates. |
| Recurrence | Calendar and completion-based schedules, weekdays, selected weekly days, nth weekday, finite series, pause/skip/stop and immutable completion history. No speculative future records are generated. |
| Marketing structure | Discipline/channel associations, campaigns/projects, strategy maps, objectives, budgets, files and account registers exist. These are a foundation, not a complete execution or measurement platform. Projects currently use campaign records. |
| Accounts and preferences | Themes, organisation settings, trial controls, social sign-in configuration, AI provider connections and permission-controlled account metadata/provider references. External provider setup is required; no native secret vault. |
| Reporting | Schedule-derived counts/health and stored reporting records. There is no verified channel-results ingestion or ROI attribution pipeline. |

## Implemented in this increment

- Explicit effort estimates, publication dates and milestone flags in the existing shared task drawer.
- Finish-to-start prerequisites with backend cycle/access validation, blocked completion, dependent-task deletion/move protection and date-conflict warnings. Non-recurring prerequisites only. Dates never cascade automatically.
- Shared drawer change history records actor, timestamp and changed field names. Existing snapshots remain available through record versions. No task content is copied into activity logs.
- Structured colleague mentions on comments with existing in-platform notification preferences. Backend requires current task access; mentioning someone never shares the task. No external messages are sent.
- Private saved filters in The List, scoped to the user and workspace. Views remain live queries and cannot grant access. Shared team views are not yet implemented.
- Version-checked bulk planned-date, priority and archive/restore edits, preview, atomic application and 15-minute undo. Undo refuses to overwrite subsequent edits or revoked access. Historical recurring occurrences are excluded.
- Task duplication as a fresh one-off task, with checklist reset and comments/recurrence/reminders cleared. Existing workspace moves remain available.
- My Work → Workload: weekly estimated hours, configurable working days/hours and days off, missing estimates and unscheduled work. Task edits use the existing drawer. Managers can inspect authorised company work and company capacity; personal and other-company workloads are never exposed in team totals.
- Archived tasks leave operational dashboard/overview counts and can be restored from The List → Archived. Archives retain dependency links and completion history.

Capacity counts effort once for the accountable owner, not once per contributor. It allocates estimates to a planned work date, otherwise across working days in the recorded start/end span. Days off reduce available hours without moving scheduled tasks. Future recurrence forecasts, skills-based allocation and full cross-company availability for other people are outside this release. 37.5 hours is an explicitly labelled, unconfigured default.

## Prioritised next increments

| Priority | Deliverable | Why / acceptance boundary |
| --- | --- | --- |
| P1 | Guided CSV/Excel import | Map columns, validate dates/owners/brands, preview errors and duplicates, then atomic import through the existing permission checks. Keep original files and existing records intact. |
| P1 | Subtasks, followers, custom fields, task templates | Assignable child tasks and reusable templates need lifecycle rules beyond checklist items; preserve the simple personal planner. |
| P1 | Shared views and wider bulk actions | Explicit team view permissions; preview and version-safe undo for assignment/list/date changes. Distinguish work date, deadline and publication date. |
| P1 | Dependency scheduling expansion | Visible Gantt connectors, lag/lead, milestones with scheduling semantics and recurring-occurrence bindings. An impact preview and explicit confirmation must precede any cascading dates. |
| P2 | Request intake → triage → task conversion | First complete cross-module workflow: internal request forms, ownership, statuses, deduplicated conversion, activity and notifications. No cosmetic request-only dashboard. |
| P2 | Rules engine and playbooks | Workspace-scoped triggers, conditions, actions, dry run, audit, loop prevention and permission rechecks. Reuse tasks/requests; do not run arbitrary code. |
| P2 | Content planning and approvals | Asset versions, approval ownership, review comments, explicit approved/published states and a shared marketing calendar. Completion is not proof of publication. |
| P2 | Campaign health and portfolio | Derive operational risks from approved definitions; distinguish scheduling health from real campaign outcomes. Add campaign-level recurring reviews. |
| P3 | Measurement, budgets and marketing reviews | Ingest verified results with provenance, date ranges and brand/channel ownership. Separate planned/committed/actual spend, objectives, attribution and review decisions. |
| P3 | Documented integrations, proofing and AI | Provider-specific authentication and capabilities, token security, failure/retry states and explicit user control. No simulated integrations or unsupported automatic publishing. |

## Verification and local review

`npm test` includes graph/capacity calculations and API tests for cycles, blocked completion, private records/views, organisation isolation, mention access, activity, scoped capacity, atomic bulk failure and undo conflicts. Existing organisation, notes, authentication, settings, vault and scheduling tests remain in the suite.

`npm run build` checks TypeScript and produces the production bundle. The current bundle retains Vite's existing large-chunk advisory.

To try the workflow locally:

1. Open My Work → The List. Add two one-off tasks in the same workspace.
2. Open the second task → Effort, prerequisites & publication. Estimate hours and select the first task as a prerequisite. Add a planned date and save.
3. The task shows Blocked and cannot be completed until its prerequisite is completed. Moving dates warns about conflicts without changing other tasks.
4. Open My Work → Workload. Set your capacity, open the task and adjust its work date/owner/estimate. Company team capacity is limited to managers and the tasks they may read.
5. Return to The List, filter and save a private view. Select tasks, preview a bulk work-date change, apply it and undo it. Deadline values stay unchanged.
6. Archive via bulk actions, then choose Archived and restore. Try Comments & activity to add a colleague mention and inspect saved changes.

UI checks performed on the existing signed-in local preview: My Work navigation, Workload layout, The List saved-view/bulk controls and the shared task drawer's effort/prerequisite fields. No real tasks were changed during these visual checks. Full populated interaction coverage is provided by the isolated API tests, not claimed as browser end-to-end coverage.

GitHub stores source checkpoints. The ignored `.data` database, uploaded data and local encryption keys require a separate secured operational backup; committing source does not back up user records.

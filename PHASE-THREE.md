# Phase 3 — Workflow Automations & Marketing Playbooks

Available at **Management → Automations & Playbooks**. The page has Automations, Playbooks, Approvals and History tabs. Phase 4 has not been started.

## Working automations

The visual editor uses **WHEN → IF → THEN**. Rules belong to an organisation, can be restricted to brands, start paused by default, and execute as the account that last saved them. Owners, admins and Marketing managers manage rules within their authorised brand scope.

Supported initial triggers:

- Task created, completed, status changed or assigned; approaching/overdue deadline; all subtasks completed.
- Campaign status changed, milestone task completed, end date reached, or a planned budget threshold crossed.
- Task approval requested, granted or rejected; Marketing request approved.
- A single scheduled date/time, including catch-up after server downtime.

Conditions support campaign, marketing discipline, accountable/delivery owner, priority, status, request form type and approval outcome. Organisation and brand scope are part of the rule itself. Only conditions present on the source can match.

Actions support creating a one-off task/follow-up, applying an existing task template, assigning a task, adding a contributor, changing task status, moving to an existing list, setting the existing task reminder, requesting a named task approval and sending an in-platform notification. Task mutations require a task/approval trigger. Source-derived work remains in its organisation and brand scope. Automated follow-ups are private to their creator and explicitly assigned recipients, who must already be authorised to read the source.

Six editable starting recipes cover creative approval, launch review, overdue work, case-study distribution, exhibition follow-up and content approval. These are drafts to adapt, not pre-enabled rules. Select the real approvers, Sales/publication owners, campaigns and request form as appropriate. The case-study recipe selects the organisation's case-study form where available.

### Reliability and permissions

- Workspace saves emit durable, uniquely keyed events in the existing SQLite database. Request approval changes feed the same event queue. Event payloads contain transition metadata, not copied task descriptions, documents or comments.
- A 15-second worker processes bounded batches. Rule/event execution has a unique database constraint, and each action chain plus its successful execution record is transactional. Failed chains roll back their tasks, edits, approvals and notifications and record an error.
- Actions created by an automation do **not** start another automation chain. This intentionally supports a single bounded chain per human or scheduled event, preventing loops and cascading task creation. A later human approval decision is a new event and can trigger its own rule.
- Rule edits/enabling apply to future events; old transitions are not replayed. Date rules can catch up a currently due/overdue source once per rule and task/campaign deadline. Fixed schedules run once per saved date/time. Daily/weekly repetitions belong in the existing task recurrence system.
- Immutable completed recurring-occurrence history does not trigger new task-created/completed automation. Recurring completion remains with the existing planner controls; a status action cannot complete a recurring series. Approaching/overdue notifications can apply to the current active instance, without generating another occurrence.
- Every execution rechecks the executor's role, current source access, brands, recipients, list/template access and workspace write entitlement. Assignment and notifications never grant new source access. Applying a task template checks recipient access and destination brand compatibility.
- Safe tests execute the real chain inside an unconditional rollback, showing validation failures and intended action summaries without saving that test's work, approvals, notifications or execution log.
- Pause is available even if an old action target has left the organisation. Failed events are recorded and not silently retried. Correct the rule for future events or perform the necessary work deliberately.
- In-app notifications join the existing inbox, respect notification type, organisation, channel, cadence and opt-out preferences, and recheck access when read. **Workflow automations** is available in notification settings.

No action can publish content, call arbitrary external services, send marketing emails, change budgets, approve expenditure or run user-supplied code. Budget triggers observe **planned campaign allocation**, not actual spend or financial approval. Date-only rules use Theory's Europe/London calendar day; fixed scheduled times are saved as absolute timestamps from the browser time zone.

## Task approvals

Task details now include **Workflow & approvals**, with a named approver and stage. The Approvals tab shows permitted requests and decisions. Only a named approver with current source access can grant/reject. The decision is tied to the saved task version; editing the task makes it stale. Unsaved task edits must be saved before requesting approval.

Where a task has named approval stages, completing it requires the latest decision for each stage to be granted for the current saved version. Granting an approval is not publication and does not bypass task prerequisites or subtask completion. Rejected or stale stages require a current approval request. These are task approvals, not an asset-proofing or financial approval product.

Creative approval example: adapt the recipe, select the assignee/approver/notification recipient, test it and enable it. Move an accessible artwork task to **In review**. The worker assigns the chosen person, creates a version-bound approval and notifies them. Their subsequent human decision can trigger the Content review notification rule. “In review” reuses Theory's existing task status rather than adding a competing “Ready for Review” state.

## Marketing playbooks

Twelve initial playbooks cover Product Launch, Marketing Campaign, Exhibition Planning, Webinar, Press Release, Customer Case Study, Email Campaign, Social Media Campaign, SEO Audit, Website Launch, Annual Marketing Planning and Monthly Marketing Review.

Each includes a recommended brief, objectives, roles, phases, task/subtask structure, relative calendar-day deadlines, prerequisites, optional approval stages, milestones, checklists, documents, KPI suggestions and review activity. These are editable recommendations, not fabricated results or automatic publishing steps.

The wizard:

1. Select the organisation/playbook, name, product/activity, delivery date, brand scope, active channels, approval stages and responsible people.
2. Preview calculated task dates before/after the selected date. Edit titles, deadlines, owners, parent tasks, dependencies and checklists; exclude unnecessary suggestions. Unselected channels/stages are omitted and their prerequisite paths resolved.
3. Confirm once to create an ordinary existing campaign plus canonical tasks, assignments, checklists, subtasks, milestones, prerequisites and stage approvals in one transaction. Expiring user-bound preview tokens prevent duplicate confirmation. Permissions, active channels, playbook version, dependencies and source scope are checked again at confirmation.

Brand-specific channel tasks are associated only with selected brands that use that channel. No channel-specific work is generated unless the user selects that channel. Invalid dependency cycles, prerequisites finishing after dependent deadlines, invalid owners and inaccessible brands prevent the whole confirmation.

Permitted members can use available playbooks to create work in their authorised brands. Managers maintain the library: create, edit, duplicate, mark inactive, restrict to brands, define roles/phases/checklists/deadlines/KPIs and capture a campaign's accessible task structure as a reusable template. Organisation-wide blueprint access does not grant access to organisation-wide work records. Capturing replaces people with configurable owner roles and excludes comments, documents, recurring history and confidential task descriptions.

Generated work feeds existing My Planner, campaign planning, marketing overview, calendar, workload and reporting through the same task/campaign records. Campaign details expose the playbook brief, product, objectives, recommended documents and KPI measures. Campaign editing now exposes lifecycle status, including **Launched**, so launch rules can be used through the existing interface.

Approved Marketing requests can generate delivery tasks through a rule, provided their saved delivery owner and agreed deadline exist. The tasks link back to the original request; its commercial/request ownership remains intact. The request becomes scheduled/converted and the existing one-time conversion guard prevents parallel manual conversion. Existing request progress/completion reconciliation and requester notifications remain in use.

## Verification and review

The workflow tests cover:

- Task status → assignment → approval → notification, safe-test rollback, named decisions and one execution per event.
- Product Launch selection → filtered preview → edited tasks → canonical campaign/planner creation, real dependencies/subtasks/approvals and duplicate prevention.
- Atomic action failure, private-source recipient rejection, brand/organisation isolation, stale approvals, overdue deduplication and preservation of existing recurring occurrences.
- Campaign launch, planned budget, campaign end, milestone, subtasks, scheduled dates, approvals and request-to-work automation.
- Ordinary selected-brand members using permitted playbooks, custom/captured templates, durable pending events and restart deduplication.

`npm test` includes the existing regression suites plus these tests. `npm run build` checks TypeScript and produces the local production bundle; Vite retains its existing large-bundle advisory.

Browser review checked the rule builder, starter library and Product Launch configuration and editable task preview. No example campaign or enabled rule was added to the user's real company; complete creation/execution was verified in isolated test databases.

The local server must remain running for background processing. This phase does not install an external worker or hosting service. GitHub stores the source checkpoint; the ignored database, uploaded documents, keys and environment settings require separate operational backup.

Stop here for Phase 3 review before Phase 4.

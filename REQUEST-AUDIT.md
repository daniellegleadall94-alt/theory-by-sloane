# Earlier requests: delivery audit and ordered queue

Audited 21 November 2026 against the conversation, the eight supplied development briefs, implementation files, tests and existing delivery notes. This supersedes historical claims that later phases had not started. “Implemented” means source and relevant tests exist; it does not imply live external-provider acceptance testing. Existing customer data has not been modified by this audit.

## Requested changes already implemented

| Request | Evidence / boundary |
| --- | --- |
| Five shared task views; channel timeline, campaign Gantt, drag/resize, board status, shared details, recent-change destinations and live channel health | MarketingOverview, PortfolioTaskEditor, portfolio and overview tests. All views reuse task records. |
| Bigger picture first in Marketing Overview; combine Marketing HQ | MarketingOverviewSummary and main routing. Legacy identifiers remain for compatibility. |
| Collapsible completed/overdue sections | SectionDisclosure and planner/overview task groups. |
| Notes organisation filter, four core/custom tags, pin/archive/share/delete/colour; remove redundant company header | Notes and notes API tests. Personal notes are still device-local; company notes are authenticated records. |
| Optional AI side panel and chosen providers | AISupport and encrypted server AI connections. Requires the user's provider configuration; a consumer AI website is not embedded. |
| Personal/company account register, folders, owners, filters, access requests/reviews and audit | PasswordManager, vault-api, account-register and planner-vault tests. Stores metadata and private 1Password item links, never passwords. |
| Company allocation/filter in My Passwords; calmer heading | PasswordManager; personal association does not transfer ownership. |
| Settings/profile/organisation administration; initials shortcuts | Settings, AccountShortcuts, OrganisationManagement and settings tests. See incomplete operational features below. |
| Original palette plus Office blue and other familiar palettes | theme.ts; Appearance. Original Theory, Office blue, violet, teal and neutral coexist with five requested palettes. |
| Theme controls, per-user/workspace precedence, readability, motion, dashboard emphasis | ThemeProvider, Appearance, theme CSS and settings tests. Full removal of hard-coded visual values remains incomplete. |
| Organisation cards, inline add/edit, collapse, archive/restore, company ordering, matching switcher; workspace management integrated | OrganisationTree, WorkspaceSwitcher, organisation-tree tests. Cross-organisation company moves remain missing. |
| Owner console and interim standard login | OwnerConsole, owner-api, owner-password tests, scripts/owner-access. Privileged grant required; company ownership alone grants no console access. |
| Owner navigation spacing and removal of repeated headings | owner.css and OwnerConsole. |
| Search icon expanding into a bar; AI icon; removed Connected workspace and repeated slogans; tighter aligned toolbars | HeaderSearch, AISupport, main/style/motion CSS. |
| Notifications in My Work and bell | My Inbox is labelled Notifications; PlannerNotifications includes mentions, reminders, requests and workflows. The My Work parent remains a container for planner/calendar/notes. |
| Primary menu simplification and individual show/hide/reorder settings | MenuSettings, navigationModel, settings API and navigation tests. |
| Visible marketing channels in personal settings | ChannelVisibilitySettings, channelPreferences and settings tests. Organisation permissions still apply. |
| Native events, recurrence, company visibility, calendar list/colours, Day/Week/Month/Year/List, navigation and remembered preferences | NativeCalendar, calendarModel/calendar-api and native-calendar tests. No external login required. |
| Remove calendar smart keys; Connect calendars below By company | NativeCalendar. External connections remain optional. |
| The List: Planned primary, remove My Day, advanced-tools panel and My Work sections; reduce row spacing | Planner and WorkNavigation. Legacy stored My Day data retained; removed tools are not silently reintroduced. |
| Campaign page beyond a list | CampaignSummary plus scoped Overview/List/Board/Timeline/Gantt/Calendar; campaign-workspace tests. |
| Phase 1 tasks/projects/workload | Canonical subtasks, owners/followers, custom fields, dependencies, reschedule preview, versions, comments/mentions, saved views, bulk edits/undo, capacity and task import. Limits: no critical path, recurrence forecasting or expanded bulk assignment/list/status operations. |
| Phase 2 request centre | Request forms/triage/ownership, restricted invitations, conversion, notifications and reports; request API tests. Invitations are manually shared, not emailed. |
| Phase 3 automations/playbooks | WorkflowStudio and workflow-api: rules, dry run/logs, 12 playbooks, preview, task approvals and permission checks. Asset proofing/publication is not implemented. |
| Strategy first approved increment | Overview plus Foundations, autosave, snapshots, independent parent copy and review task/event generation; strategy API tests. |
| Shared sign-in panel cleanup | AccountGate used by Settings, Passwords, Learning, Calendar connections and embedded Strategy prompt. |
| GitHub source checkpoints | Main pushed through a344f27 before this audit. Source backup is not operational data backup or scheduled future backup. |

## Outstanding work, in order

1. **Complete: user-facing Marketing channels terminology.** Updated settings, filters, workload, automation forms and validation; stored identifiers remain compatible. Build passed; commit 19655e8.
2. **Complete: Strategy Business Context.** Products/services, revenue priorities and business goals, using the same autosave, reviews, copies and snapshots as Foundations. Build, module-isolation/review tests and visual check passed.
3. **Complete: Strategy Audience.** Repeatable persona cards for all requested fields, help/examples, autosave, remove/undo, completion checks, independent copies, snapshots and six-month review tasks/events. Build, API tests and browser card/autosave/navigation check passed.
4. **Strategy Market & Competitors.** Competitor cards, trends and quarterly reviews.
5. **Strategy SWOT.** Editable quadrants and accept/dismiss suggestions from previous answers.
6. **Strategy Positioning & Messaging.** Value proposition, persona messages, proof and voice.
7. **Strategy Objectives & KPIs.** Reuse canonical objectives; timeframe/targets/owner/dates and campaign/task links.
8. **Strategy Channel Mix.** Shared channel purpose/objective records, genuinely two-way with channel management.
9. **Strategy Budget & Resources, then Review & Measurement.** Allocations/team/tools and success/cadence; retain explicit money allocations.
10. **Strategy presentation/export/dashboard.** Branded flip book, PDF selections and stored downloads, completion/review/objective widget.
11. **Calendar Outlook two-way first, then Google.** Dedicated Theory calendar, task/event mappings, writes/imports, incremental sync/subscriptions/renewals, background polling, conflicts/history, confirmation for deletion, recurring instance rules, organiser edits with attendee warning. Existing code only reads meetings; My Week/timeline meeting coverage also needs extending. Live acceptance requires provider setup.
12. **Move a company between organisations.** Secure atomic migration of company-owned records, assignments, channel plans and references, explicit permissions and privacy-change confirmation, then tree drag/drop. Reordering within an organisation already works.
13. **Operational backups.** Source pushes work; scheduled verified database/upload/key backups and a restore drill do not exist. Choose an authorised private backup destination and retention; never commit secrets or customer databases to GitHub.
14. **Finish theme-token audit.** Replace remaining hard-coded component colours/radii/shadows; verify all palettes and reduced motion across pages.
15. **Settings operational completion.** Password reset/verified email changes, invitation and notification email delivery, MFA enrolment, actual retention/closure processing. Provider and policy decisions required before live delivery/destruction.
16. **Owner console expansion.** Product activity/online presence, support cases, organisation lifecycle/entitlements and monitoring. Payments/revenue/website analytics require genuine integrations. Supplied owner brief ends at “Trial subscriptions”; no unseen remainder is claimed implemented.
17. **Marketing expansion roadmap.** Versioned asset proofing and ordered approvals; content planning/distribution; richer portfolio health; budgets planned/committed/actual; results provenance/attribution; structured reviews; contact/CRM and specialist social/email/SEO/PR workspaces; broader import/export/search; optional service integrations. Existing task directories and generic records are foundations, not delivery of these specialist products.
18. **Public promotional website (new request, queued).** Up to two pages as the public first destination, introducing Theory with Register and Sign in leading into the portal. Reuse existing account creation and sign-in; keep public marketing separate from authenticated workspace routes. Domain/public deployment remains a configuration decision. Do not fabricate pricing, testimonials or unimplemented feature claims.

## External setup and deliberately deferred boundaries

- Google/Microsoft/LinkedIn sign-in: server code exists; app registration, server credentials and live account-linking tests pending. Guide: docs/social-sign-in-setup.md.
- Outlook/Google imports: encrypted tokens and consent flow exist; live accounts require configured OAuth applications. No live sync acceptance has been passed.
- AI: actual use requires an authorised provider connection and user key. No automatic publishing or sending.
- Credential sharing/ownership transfer/revocation: perform through the password provider until documented integration is implemented and tested. Theory permissions do not revoke an external password. Native secret storage remains deliberately excluded pending dedicated review.
- Public deployment/domain/TLS, email service, billing plans/provider and analytics sources are not configured by a local preview or GitHub push.
- Sample companies/dates from screenshots are illustrative, not records to recreate blindly. A hierarchy repair script exists; verifying the user's real company data requires the authorised signed-in workspace.

## Execution log

- 21 November: audited source and delivery notes; recorded previously undisclosed partial delivery and superseded wording. Completed items 1 and 2 sequentially.
- Incoming palette fix complete: Appearance now works in a local/guest workspace, with device-only persistence clearly labelled; palette choices and Save verified in the browser and build passed (d4dddb1).
- Sign-in navigation fix: Settings closes the expanded login form when changing sections; the tab now says Existing account and the actual submit button says Sign in to Theory. Browser navigation verified. The browser may still offer saved passwords when the user deliberately focuses a login field; Theory does not control that native popup. No real user sign-in was submitted during this check.
- Audience completed after the two incoming fixes. Next queued implementation: Market & Competitors. Public promotional site added to the queue. Subsequent requests stay queued until the active item is checked and saved. Codex's message-queue bar is application UI, not something this repository can control.

Each item is only marked complete after relevant validation. Later requests to remove controls take precedence over earlier requests to add them. This queue records the work; it does not install a timed automation or promise background execution while Codex is closed.

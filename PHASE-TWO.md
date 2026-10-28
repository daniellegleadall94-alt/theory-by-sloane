# Phase 2 — Marketing Request Centre

The Marketing Request Centre is available under **Management → Request Centre**. It uses the existing organisations, brands, memberships, task/campaign records, templates, planner assignments, theme tokens and inbox. Phase 3 has not been started.

## Review locally

1. Open Request Centre and choose an organisation. Personal space has no company request queue; All my organisations shows only requests the signed-in user may access.
2. Select New request. Nine starter request forms cover campaigns, creative, websites, social, case studies, launches, events, PR and general support. Managers can customise forms or create their own with required core fields, additional questions, response hours and expected turnaround days.
3. Submit the brief, requested date/priority, department, purpose, audience, deliverables and requester responsibilities. Attach up to five small PDF, image or text files. Required fields are validated on the server.
4. Marketing managers can request information, review, approve/decline, assign a delivery owner/contributors/approvers, keep a separate request owner and commercial follow-up owner, and set an agreed deadline. The original requester and requested deadline are retained.
5. Reply through the request conversation. Requesters see public messages and progress; internal notes and their history are only returned to authorised Marketing managers.
6. Save the review, then generate a standalone task, project/campaign with a task, or multiple tasks from selected existing templates. Conversion is transactional and can run only once per request. Work is assigned to the saved delivery owner/contributors and feeds into their existing planner and workload views. Project records reuse the application's existing campaign category model.
7. Linked tasks open the usual task editor. Its Source request button opens the original brief. Campaign/project links open the existing campaign planner. Briefs and supporting documents stay on the request rather than being copied into generated work.
8. Starting linked work updates the request; completing all its delivery tasks records completion and notifies the requester. Reopening completed work reopens the request. The 30-second server worker and request/inbox reads reconcile these changes. Linked tasks stay in their source organisation and cannot be permanently deleted or moved out; they can be archived.
9. Use list/Kanban views, status queues, search, sorting and organisation/brand/priority/department/owner filters. Managers can drag Kanban cards; the same server-side scheduling and completion rules apply. Status controls provide a keyboard alternative.
10. Reports use the visible, filtered request dataset: received/completed/outstanding counts, department/organisation/brand counts, actual recorded elapsed response/completion time and generated task counts by request type. Empty datasets show no invented performance metrics.

## Restricted requester invitations

Marketing managers can create a private, revocable invitation for a named colleague or approved external collaborator. Each invitation fixes one request form and a brand scope, expires in 1–30 days, and is shown only once. The secret is hashed in the database; it is held in a URL fragment and sent as an Authorization header, never embedded in API paths or stored in localStorage.

Possession of the invitation is the portal authorisation mechanism. It is **not** email verification or an unrestricted Theory membership. Anyone given the link can use that invitation's own submissions, so managers must share it only with the intended requester. One invitation cannot access another invitation's requests, organisational directories, internal notes, task editors or other workspace records. Revocation, expiry, loss of the issuing manager's membership/brand permission, inactive forms and archived brands prevent further submissions as appropriate. The portal is rate limited, with ten submissions per invitation per day.

The local `127.0.0.1` preview is accessible only on this computer. Remote collaborators require a hosted HTTPS deployment. Invitations are shared manually; email sending is not connected. No public anonymous forms have been introduced.

## Persistence, permissions and boundaries

- SQLite holds form definitions, original form snapshots, requests, messages, audit events, links, hashed invitations and request notifications. No request content is cached in localStorage.
- Managers need current organisation membership and access to every request brand. Ordinary members, viewers and collaborators can submit within their authorised brand scope and see their own requests. Explicit responsibility assignments and authorised delivery task assignments can grant access to the related brief, never internal triage notes. Membership and brand changes are rechecked on every endpoint and notification read.
- Optimistic versions protect reviews, replies and conversion. If another update arrives, an unsaved review requires a refresh rather than silently overwriting it. Every conversion revalidates people, brands, templates and workspace write entitlement in a transaction.
- The existing inbox includes a Marketing requests section and a matching notification preference. Notifications support incoming requests, ownership assignment, information, decisions, deadline updates, overdue delivery/response targets and work completion/reopening. They are in-platform; email delivery remains unconfigured. Existing opt-outs and organisation/type preferences are respected.
- Requested and agreed deadlines remain distinct. Changing the agreed request deadline does **not** silently reschedule existing tasks: those task commitments are edited through their normal task/scheduling controls. Work progress is derived from the live canonical tasks.
- Approvers are recorded responsibilities. This request approval process is performed by authorised Marketing managers, not a new multi-stage content sign-off engine.
- Turnaround settings are planning guidance in calendar days from approval; response targets use elapsed calendar hours. No holiday-aware SLA engine, public portal, email service, rules engine or Phase 3 integration is claimed.

## Verification

`npm test` includes the existing suites and three Request Centre integration tests. They exercise the requested Sales case-study journey, preserve commercial responsibility, check requester/internal-note separation, organisation and brand isolation, restricted collaborator submissions, server-validated mandatory/custom fields, version conflicts, one-time conversions, canonical planner assignments, task progress/completion, template checklists, invitation isolation/revocation, hashed token storage, real persistence across restart and overdue deduplication.

Browser review uses the existing local preview without adding example requests to the user's live workload. The member-directory SQL query used by these controls was corrected and is covered by the request workflow regression test.

GitHub backs up the source checkpoint. The ignored database, uploaded documents, local keys and environment configuration still require a separate secured operational backup.

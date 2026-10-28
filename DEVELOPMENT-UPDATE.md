# Theory development update — 28 October 2026

This release extends the existing application and its canonical workspace records. It does not replace the application or create a second task database.

## Delivered

- **The List:** smart lists, quick entry without a deadline, a right-hand task drawer, importance, independent planned dates, My Day selections, weekly planning, search, sorting and filters alongside the universal organisation and brand scope. My Week drag-and-drop changes planned dates, not deadlines.
- **Lists and groups:** naming, folders, ordering, icons, colours, archives, movement and scoped sharing. Removing a list on the server keeps its tasks and preserves their existing access, including completion history.
- **Task details:** one accountable owner, contributors, notes, checklist, attachments, comments, campaign/discipline/brand associations and completion activity. New comment attribution comes from the authenticated server user.
- **Recurrence:** daily, weekdays, selected weekdays and intervals, monthly dates or relative weekdays, yearly dates, starts/ends/counts, scheduled or completion-based recurrence, pause/resume/stop and skipping. Single-occurrence edits retain series defaults. Completion is a version-checked server action with one next occurrence and immutable completed occurrences, including the final occurrence of a finite series.
- **Reminders:** persistent server processing, catch-up at startup, deduplication, current permission checks and in-app notifications. Notification types, organisations, channel, frequency and time preferences are respected. Recurring reminder times preserve local wall time across daylight-saving changes; nonexistent spring-forward times require another time.
- **Appearance:** Clay and olive, Sand and terracotta, Stone and slate, Heather and rust and Night. Personal settings override workspace settings, with admin-only workspace changes. Includes colour overrides, contrast/sidebar/corners/motion controls, live preview, readability checks, brand colours and a cached theme applied before the application renders.
- **Dashboard:** removed the requested sentence, highlighted focus and overdue information, added a live seven-day workload chart, brand labels, campaign scrolling and a Task/Campaign/Project/Routine creation menu.
- **My Learning:** private learning records for courses, certifications, qualifications, workshops and awards, with status, completion/renewal dates and certificate references.
- **Account register:** My Passwords, Settings → Organisation → Access & Credentials and a Marketing Accounts view under Marketing Tools use the existing `account` record kind. Personal records are independent of the selected organisation. Company records support folders, categories, account owners, brands, restricted/named/brand/organisation/group access, expiry, discoverability, access requests, archiving and planner review tasks.
- **Company access lifecycle:** account records survive departing staff. Membership removal immediately removes company access and marks relevant account records for review/rotation. Private account records remain independent. Access management uses organisation-scoped audit events and versioned records.

## Credential storage boundary

The account register stores **non-sensitive metadata**, not passwords, tokens, recovery codes or encrypted password blobs. Those fields are rejected by the API. Records are fetched through authenticated, scoped APIs; the register does not write account records to browser local storage.

The supported first-release provider workflow is a **1Password private item reference**. Theory accepts private item links, rejects public sharing links and does not retrieve secrets or claim that a provider API is connected. The provider still authenticates the person opening an item and enforces its own vault permissions.

Official reference: [1Password private item links](https://support.1password.com/item-links/). Selective sharing, provider invitations, external access expiry/revocation and credential ownership transfers must be performed in the provider. Theory register access is a separate permission. Revoking register access cannot invalidate a previously disclosed credential; review and rotate it with the provider where needed.

## Configuration and future work

- Actual email reminder delivery needs an email service integration. The in-platform reminder worker is operational while the Theory server is running; a hosted deployment needs an always-running server process.
- Google, Microsoft and LinkedIn sign-in implementations require registered provider applications and server-side configuration described in `SOCIAL-SIGN-IN.md`.
- AI providers require the user's own configured connection, as described in `AI-SUPPORT.md`.
- No native password vault, automatic provider credential sharing/transfer, payment integration or course storefront is represented as operational. My Learning can hold records now; a future course catalogue needs the platform destination and catalogue integration.
- GitHub stores source, tests and documentation. Local SQLite data, uploaded files inside the database, server encryption keys and `.env` secrets are intentionally excluded. They require a separate private data-backup process. Pushing a source checkpoint does not configure scheduled future backups.

## Verification

`npm run build` and `npm test` cover the existing application plus advanced recurrence, month ends, leap years, DST, single-occurrence edits, immutable history, private-list removal, organisation isolation, vault grants/revocation/expiry/groups, provider reference validation, personal/workspace theme permissions, contrast checks and reminder deduplication across a server restart.

The planner was inspected in the local browser. Later browser verification encountered an in-app connection/error-page policy restriction, so the remaining appearance and vault screens need a final interactive visual review in the local preview.

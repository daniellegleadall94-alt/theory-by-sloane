# Organisation and business workspace foundation

The existing `companies` and `memberships` tables are retained as the organisation boundary. Business units have stable IDs, editable labels and archive status. `parent_id` is reserved for future hierarchies; the current interface supports one subdivision level. Workspace names and logos remain compatible with existing accounts.

## Data ownership

`server/workspace-api.mjs` owns tasks, campaigns, groups, strategy maps, objectives, KPIs, files, knowledge, activity records and other supported record kinds. Every record belongs to exactly one organisation or one personal account. A record can reference multiple business units in its owning organisation. It is stored and counted once. Budget splits are explicit allocations; they are never inferred by repeating a shared campaign's total.

The API checks organisation membership, business access and record permissions on every request. Restricted business members need access to every unit associated with a record, or an explicit record grant. Organisation-wide records require organisation-wide access. Viewers and collaborators cannot write. Managers can edit permitted records; members can edit their own or assigned records. Assignment alone never overrides business access. Roles apply separately in each organisation.

Record updates and deletes require the current version. Files retain authenticated version history in SQLite. Task transfers validate both source and destination and commit in one transaction, including recurring history. Campaign links cannot cross organisations.

`GET /api/my-work` returns only the account's personal and assigned, authorised tasks. It omits inaccessible campaign names and does not return campaign budgets. Cross-organisation workload views use that authorised task set. Organisation management and commercial reporting remain scoped to one organisation.

## Client context and legacy compatibility

`WorkspaceProvider` owns the persistent global organisation/business selection and supplies filtering and creation defaults. Page filters refine this context. The switcher supports all, one or multiple authorised businesses and the personal All My Work mode. Workspace switches retain the current page.

Existing task and campaign components still use the shared storage event interface. For signed-in users, it is now a cache and optimistic editing bridge to the authenticated API. Data is pulled on focus and every thirty seconds while no local write is pending. Writes refresh the other views and personal assignments. Failed writes preserve a separate unsynced draft and show a visible error; reloading saved records does not remove that draft backup. Open task editors detect a changed cached version before saving.

On first sign-in after this update, legacy local records are imported additively. Existing server records are never overwritten by an import. Browser originals are retained, and an additional `theory.browser-backup.v1:<account>:<organisation>` snapshot is saved before import. Legacy brand names are converted to stable unit IDs. Only owners and administrators may import organisation data. Guest work and existing personal notes remain browser-based; company notes retain their existing private/share model with business-access checks added.

New features should use the authenticated record API and stable `unitIds`, never a display name as an ownership key. Task dates remain on the task record. Schedule views, planner, discipline workspaces and channel health read those same task records.

## Local preview and limits

Run `npm run dev -- --port 5174 --strictPort` for the preview and `npm test` for regression checks. `npm run build` checks TypeScript and builds the production assets. The default local database is `.data/theory.sqlite`; isolated API tests use in-memory databases.

This is a local application foundation, not a deployed multi-tenant service. Payment collection, trial enforcement, external publishing, OAuth account connections, production hosting and monitoring are not connected. Subscription metadata records a seven-day trial per organisation without introducing a permanent free plan or arbitrary account limits. Channel activity screens are scoped planning records, not fully developed social/email/advertising studios. Local file uploads are limited to 4 MB. Personal notes have not been migrated into the universal record store.

The automated suite covers organisation and personal isolation, multiple memberships, different roles, restricted business access, record grants, shared campaign budget totals, task completion, transactional transfers, stale versions, archived units, file versions and legacy imports. Browser visual verification for this update was blocked by the browser URL policy and remains to be reviewed in the running preview.

## Notes account view

The Notes & Ideas page reads `/api/notes` across the account's authorised organisations, then applies its explicit organisation, tag and archive filters. The private ownership and selected-recipient sharing model is unchanged. Existing company note routes remain compatible. `note_preferences` stores pins and archive state per user, including read-only recipients; organising a shared note does not change another user's account. Personal notes remain in the existing browser store. Four core tags are offered as suggestions alongside user-defined tags.

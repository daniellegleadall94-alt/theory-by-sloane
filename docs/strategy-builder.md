# Strategy builder — initial release

The Marketing Strategy channel and Marketing Overview → Strategy & Objectives open the same builder. Existing objective and KPI records remain accessible through “Existing objectives & KPIs”.

## Available now

- An overview of all ten planned modules, with Foundations, Business Context, Audience, Market & Competitors, SWOT and Positioning & Messaging operational. Other modules explicitly indicate a later release.
- One Foundations record per authorised organisation or company. Uses `workspace_records` kind `strategy`, existing record assignments, company grants and version history.
- Mission, vision, values, brand promise and purpose, helper text and expandable examples.
- Business Context: products/services, revenue priorities and business goals marketing supports, with helper text and examples. Its answers, versions, completion and six-month default review cadence are independent of Foundations. Both modules support independent organisation-to-company copying, snapshots, reviews and task/event reminders. Existing Foundations records and URLs are preserved.
- Audience: repeatable persona cards for name, segment, role, pain points, goals, buying triggers, where they spend time and preferred channels. Every field has help and an expandable example. Draft cards autosave; completion requires at least one fully answered persona. Remove has an immediate Undo action. Up to 30 cards per module, with server-side field/ID/size validation. The same independent copying, snapshots, comparisons and six-month review task/event cycle apply.
- Debounced, serialised autosave with optimistic version checks. Failed saves leave answers visible; reload warns before discarding an unsaved draft.
- Editable review cadence, completion validation, due-review status and completion/review snapshots referencing immutable saved record versions.
- Review mode showing the latest completed answers beside the current form, plus side-by-side snapshot comparison.
- Copy organisation Foundations into an authorised company. The copy has independent answers and review state; provenance references its source version. Existing target snapshots are retained when replacing a copy.
- Review task and native all-day event generation, with company permissions and stable identifiers per module/review date. A minute worker checks due reviews while the Theory server is running. Offline periods are caught up on a later worker pass; this is not an externally hosted always-on scheduler.
- Review tasks and events link back to their specific module.
- A separate, clearly labelled personal draft on the current device when no company is selected. Company persistence, copies and scheduled review records require sign-in. Local drafts are not automatically transferred into a company.

## Later phases

The other four guided modules, objective/campaign links, canonical two-way channel-purpose editing, branded flip book/PDF export history and dashboard strategy widget remain queued in REQUEST-AUDIT.md.

## Verification

`tests/strategy-api.test.mjs` checks incomplete drafts, review dates, completion/review snapshots, optimistic conflicts, independent copying, company and brand isolation, read-only access, loss of membership, generic-write protection and review reminder deduplication.

## Additional guided modules

Market & Competitors stores up to 30 competitor cards with all seven requested fields, plus market trends. SWOT uses four editable lists and suggests competitor strengths as threats, competitor weaknesses as opportunities, and values as potential strengths (explicitly requiring judgement). Accepted points become independent answers; dismissed suggestions persist and can be restored. Positioning & Messaging has a value proposition, up to 30 persona messages, proof and voice. Persona names offer existing Audience values without changing those records. All three use the established permission checks, independent copies, immutable completion snapshots and review scheduling.

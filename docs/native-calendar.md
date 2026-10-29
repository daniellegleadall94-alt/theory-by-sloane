# Native calendar

My Work → Calendar and Management → Marketing Calendar open the same native calendar. Neither requires Microsoft or Google authentication. Signed-in Theory users persist events and calendar preferences in the existing SQLite database. Guests can use a device-local personal calendar; company sharing requires a Theory account.

## Data and access

Native events reuse `workspace_records` with `kind=event` and `calendarEvent=true`. Existing generic marketing event records remain intact and are not interpreted as scheduled events until explicitly given native scheduling fields. The existing organisation membership, company grants, record version checks and write restrictions apply. Personal events stay in the user's personal scope. Company events are shared with users who can read the selected company scope; attendees do not grant access or send invitations.

Events store local start and end values plus an IANA time zone, or inclusive start/end dates for all-day events. The calendar displays timed events in the user's preferred zone (Europe/London by default). Nonexistent local times at a daylight-saving transition are rejected when saved. Events do not have task completion controls. Dated tasks remain canonical task records, so completion and rescheduling continue through existing task APIs.

`calendar_preferences` stores each Theory user's chosen view, hidden calendar keys and colour overrides. Calendar selections combine a type filter (Tasks/Events) with a scope filter (personal, organisation-wide or child company). The organisation checkbox selects its organisation-wide items and all active child companies. “Show only this” resets the other selections. Organisation colour changes apply to its children. Existing organisation and company colours provide defaults; individual calendar overrides are private to the user.

## Interaction

- Day and Week provide 15-minute creation and drag/drop targets, with draggable start/end edges on event blocks. Month supports date moves. Date/time fields in the details drawer provide a keyboard alternative.
- Month, Year and agenda use the same calendar selections. Year dots use calendar colours; month/day buttons navigate to the corresponding view. List supports 7-day, 30-day and custom ranges.
- Events can repeat on a schedule with individual exceptions. Details support this occurrence, the whole series, or this and future occurrences. Future edits split the series atomically; earlier history remains. Future exceptions are reset when splitting a series.
- Today, previous/next, view buttons and date pickers control navigation. The sidebar collapses behind Calendars on narrow screens. Reduced-motion preferences suppress transitions.
- Moving an event between organisations uses a confirmed, transactional scope change. It rechecks destination membership, company access and role; moving a personal event to a company makes its details visible to authorised company members.

## Optional external sync

Outlook/Google OAuth, subscriptions, external meeting ingestion and two-way sync are not implemented by the native calendar change. There are no simulated account connections or external meetings. The calendar functions independently and does not require provider credentials. The separately proposed sync layer still needs implementation, provider app registrations, consent and a reachable HTTPS callback service. Connected-account calendars should only be added to this sidebar once backed by a real connection.

## Verification

`node --test tests/native-calendar.test.mjs` checks recurrence, exception expansion, future splits, midnight boundaries, DST conversions, invalid times, company isolation, private ownership, restricted-company access, version conflicts, moving scopes, per-user preferences and deletion. The full existing `npm test` suite includes these checks.

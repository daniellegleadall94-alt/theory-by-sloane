# Outlook and Google calendar imports

Theory has a native calendar without third-party sign-in. Optional external calendar connections are private to the signed-in Theory user, independent of organisation membership and workspace selection. These connections **read** external calendars; they do not publish Theory tasks or events, edit meetings or send attendee updates.

## Connect and use

Open **Connect calendars** in the calendar toolbar, or **Settings → Calendar connections**. Connect Outlook or Google, complete the provider's consent screen, then choose calendars using the checkboxes. Multiple accounts are supported, including multiple accounts from the same provider. The default calendar is selected initially; other calendars require selection.

Connected calendars appear under their account names in the native calendar sidebar. Their outlined meeting blocks appear in Day, Week, Month, Year and List views, with calendar colours, time-zone conversion, details, attendees, location, organiser and join links. They remain view-only; open the original provider to edit a meeting. Sidebar checkboxes and “Show only this” use the same visibility controls as native work.

The calendar fetches a bounded date range, expands recurring provider events into occurrences, caches results, and refreshes at most every five minutes while the calendar is open. Navigating beyond the cached range fetches that range. Sync now also refreshes the calendar directory. These are imports on demand, not background webhooks or delta-based two-way sync.

Disconnect removes the saved tokens, imported calendar metadata and cached meeting data from Theory. It preserves native tasks/events and all external calendars. To revoke the app's provider-side consent as well, use Microsoft's or Google's own connected-app controls.

## One-time server setup

Set `THEORY_PUBLIC_URL` to the canonical app origin. Register Web OAuth applications and these exact callback URLs:

- `THEORY_PUBLIC_URL/api/calendar/oauth/microsoft/callback`
- `THEORY_PUBLIC_URL/api/calendar/oauth/google/callback`

For Outlook, enable Microsoft Graph delegated `Calendars.Read`, `User.Read` and `offline_access`. Select the appropriate supported account types in Microsoft Entra; `THEORY_MICROSOFT_TENANT=common` supports the general work/personal flow when the app registration permits it. An organisation's own consent policy may require its administrator to approve the app.

For Google, enable Google Calendar API and configure the consent screen, test users or production verification as applicable. Requested scopes are `calendar.readonly`, `openid` and `email`. Offline access is requested so refresh tokens can be used.

Use dedicated `THEORY_CALENDAR_MICROSOFT_CLIENT_ID` / `_CLIENT_SECRET` and `THEORY_CALENDAR_GOOGLE_CLIENT_ID` / `_CLIENT_SECRET`, or reuse the existing Microsoft/Google sign-in credential pairs with these additional redirect URIs. Calendar consent is a separate flow; a linked social login is not a calendar connection. Restart the server after changing environment configuration.

HTTPS deployments require `THEORY_CALENDAR_MASTER_KEY`: a private, base64-encoded 32-byte random key. For example, generate it locally with Node's `crypto.randomBytes(32).toString('base64')`, then place the value in the server secret configuration. Never paste it into application notes or commit it. Local HTTP loopback development persists a generated key in `.data/calendar-master.key`. Back up the key securely with the database; losing it requires reconnecting accounts. The key and database are excluded from Git.

## Security and persistence

- OAuth authorization code flow uses PKCE S256, random single-use state, a browser-bound HttpOnly SameSite=Lax flow cookie, a ten-minute lifetime and the originating Theory session. Callbacks still require that session to be valid; logging out or suspension invalidates pending flows.
- Access and refresh tokens are encrypted with AES-256-GCM using a random nonce and owner/account-bound authenticated data. Tokens are never returned to the browser or written into audit messages. Refresh operations are serialised per account.
- Account ownership is enforced server-side on every read, calendar selection, refresh and disconnect. Company administrators receive no automatic access to personal imported meetings.
- Provider requests use fixed HTTPS endpoints. Paging links are restricted to the expected provider API origin, redirects are rejected, and request size, date range and pagination are bounded.
- Revoked/expired grants produce a Reconnect state. Transient refresh errors preserve the last cached data and show an error; they do not claim a successful refresh.
- External notes are rendered as text. Provider/join links are restricted to HTTPS. External events cannot be completed, moved or resized through native task/event mutations.

Tables: `calendar_accounts`, `calendar_oauth_flows`, `external_calendars`, `external_calendar_events`. Connections and cache entries use user-owned accounts, not company-owned workspaces. Existing Theory records remain unchanged.

## Validation and remaining work

`tests/calendar-connections.test.mjs` uses mock provider responses to check Outlook and Google consent callbacks, state replay and browser binding, multiple accounts, encrypted token storage, colleague isolation, calendar selection, cached refresh, token rotation/revocation, unsafe paging/link rejection and disconnect preserving native tasks. Live provider acceptance testing requires configured app registrations and the user's sign-in/consent; it has not been performed without those credentials.

Full two-way task/event publishing, provider change subscriptions and organiser meeting editing from Theory remain separate work. There is no claim that this read-only import implementation provides those features.

Provider references: [Microsoft calendarView](https://learn.microsoft.com/en-us/graph/api/calendar-list-calendarview?view=graph-rest-1.0), [Google OAuth web server flow](https://developers.google.com/identity/protocols/oauth2/web-server), [Google Calendar scopes](https://developers.google.com/workspace/calendar/api/auth), [Google event listing](https://developers.google.com/workspace/calendar/api/v3/reference/events/list).

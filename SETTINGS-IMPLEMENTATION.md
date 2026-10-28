# Settings implementation

Settings uses the existing compact primary rail and a grouped secondary panel, with focused pages for Personal, Organisation, Subscription, Connections, Data & Privacy and Help. Personal settings belong to the account; organisation and billing endpoints use explicit organisation IDs and server role checks. Selected brands do not determine billing permissions.

## Working now

- Profile details, display name and avatar persist on the server. Display names and avatars update the account header. Login email is read-only until verified email changes are configured. Creation dates are recorded for new accounts; legacy dates are shown as unrecorded.
- Appearance, density, default landing page, planner view, task sorting, completed-task visibility, initial sidebar, guidance and notification-bell preferences persist per account. Light/dark/system appearance is applied to the app. Initial landing/sidebar defaults apply on a new session; current navigation survives workspace changes.
- Password changes verify the current password, retain salted scrypt hashing and revoke other sessions. Active sessions show genuine recorded dates and expiry. Existing sessions without creation metadata are labelled accordingly. Session tokens are never returned by Settings.
- Existing social login methods can be linked from Login & Security. Password reset, verified email change and two-factor enrolment are explicitly unavailable pending the required account recovery/delivery infrastructure. No working 2FA control is simulated.
- Notification type, channel, frequency, delivery time, time zone and organisation choices are saved as a notification policy. Security messages remain enabled. The saved policy is a foundation, not an operational email delivery scheduler. No daily/weekly emails are sent yet.
- Organisation details, name, logo, department guidance and standards persist separately per organisation. Business-unit logos, descriptions, website/social/contact references and responsible members extend the existing stable business-unit records. Existing rename/archive/restore, discipline configuration, role and business grants and last-owner safeguards are reused.
- Team invitations can be viewed and cancelled. Reissuing an invitation for the same email replaces its old code. Invitations remain manual codes; no delivery emails are sent.
- Billing pages show stored seven-day trial dates, effective expiry, actual member/business/record counts and decoded uploaded-file bytes. Trial expiry is enforced as read-only for organisation records, business-unit changes and company-note writes. Reads, authorised exports, account security and ownership/closure administration remain available. No expiry operation deletes data. Pricing, paid plan activation, billed seats, checkout, subscriptions, invoices and payment methods need a configured payment provider and tested entitlements; none are fabricated or activated here.
- Personal JSON exports exclude credentials and include authorised owned notes, personal records and browser notes on the current device. Organisation exports require owner/admin access. No API keys, passwords or session tokens are exported.
- Server audit records cover successful administrative/security mutations from this release onwards, recording actor, timestamp, action path and appropriate organisation scope without request bodies. Database triggers prevent audit updates/deletes; there is no client mutation endpoint. Ordinary users see their own history; organisation-wide logs require owner/admin access.
- Members can leave an organisation after verification and typed confirmation; the last owner cannot leave. Personal and organisation closure requests are separate, verified, typed-confirmation requests. Sole owners must resolve ownership before requesting personal closure. Requests remain pending for review: they do not erase data, cancel billing or run an automatic retention job.
- AI Settings opens the working existing AI panel and shows only saved/verified connections. Connected Apps distinguishes social authentication from marketing service permissions. Future external connections and marketing email sending remain explicitly unconnected.

## Storage and security

`server/settings-api.mjs` adds `user_settings`, `organisation_settings`, immutable `administrative_audit` and `closure_requests`, alongside creation metadata on users/sessions. It reuses existing users, memberships, business units, subscriptions, password hashing, session cookies and permissions. There is no separate authentication, billing or card store.

Social-only accounts require a recent social login for protected lifecycle operations. Email/password accounts verify their current password. Email-addressed invitations still require the existing social email-verification rules. Closure requests are intentionally a review workflow until permanent-erasure, retention and billing cancellation operations are configured.

## Validation and preview

`npm run build` checks TypeScript and builds the app. `npm test` includes settings account/organisation isolation, validation, password/session revocation, real usage counts, audit permissions/redaction, exports, last-owner restrictions, closure requests and expired-trial data retention, as well as all existing feature regressions.

The local preview runs at `http://127.0.0.1:5173/`. Open **Settings & workspace** in the sidebar. External providers remain unconfigured; tests use temporary databases and mocked external identity/AI services. Browser visual verification remains outstanding because browser inspection was blocked by the URL policy earlier in this session.

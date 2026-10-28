# Theory Owner Console — initial release

Open `/owner` on the Theory server. This entry renders independently of the customer providers: it does not load the customer workspace, notes or credentials. Deployment must route `/owner` to the SPA entry and `/api/owner/*` to the API. No production domain has been selected or deployed.

## Staff identity setup

Use a dedicated internal OpenID Connect application with mandatory MFA, for example an Auth0 workforce application. The existing `openid-client` library performs discovery, signature validation, authorization-code exchange, nonce/state and PKCE validation. Register an exact callback of `THEORY_OWNER_URL/api/owner/auth/callback`. Set the canonical origin (no path) and issuer, client ID and secret in server-only environment variables. Outside loopback development the origin must use HTTPS. Terminate TLS on the application server or configure the deployment to preserve the existing API same-origin checks; forwarded headers are not implicitly trusted.

Set `THEORY_OWNER_STAFF` to a JSON array of `{ "subject": "exact-provider-subject", "name": "Staff name", "roles": ["Platform Owner"] }`. Subjects are matched to the configured issuer; email and customer organisation roles never grant access. Multiple roles combine their permission sets. Optional `permissions` restricts a staff identity to an explicit subset of known permissions, configured by the operator on the server. Changes take effect on server restart, including revocation. Never place this configuration in a `VITE_` variable or commit real identity data or client secrets.

Six platform roles are supported: Platform Owner, Platform Administrator, Customer Support, Billing Administrator, Marketing / Growth Administrator and Technical Administrator. Their default permissions are defined in `server/owner-api.mjs`. There is no self-enrolment, default privileged account or customer-to-staff promotion route.

Sign-in requires a verified ID token with `amr` containing `mfa`, a recent `auth_time`, and an approved subject. Merely requesting MFA does not satisfy the server check. Configure the provider to perform an actual challenge for every staff login and emit these claims. Providers that do not emit this evidence are refused. Test with your real identity provider before production; automated tests use an injected isolated provider stub, never a production bypass. No OAuth tokens are retained or returned to the UI.

Staff cookies are HttpOnly, host-only, scoped to `/api/owner`, Secure on HTTPS, with a one-hour absolute lifetime and fifteen-minute idle timeout. Login uses a separate short-lived SameSite=Lax flow cookie and single-use state. Mutations require same-origin JSON. Suspending/reactivating customers or revoking their sessions requires the management permission, typed email confirmation and MFA authentication within five minutes. Reauthenticate when prompted. Suspension blocks password and social session issuance and removes customer sessions; it does not delete customer records.

## Available now

- Executive totals for unique people, organisations, memberships, current trials and expiring trials. Registration date-range comparisons use UTC. Unknown legacy registration dates are not invented. Trial counts use existing organisation subscription records.
- Persisted per-staff dashboard order and hidden cards, date filters and permitted aggregate JSON export.
- Searchable, paginated user and organisation directories with deliberately selected metadata fields, user memberships and authentication-provider names, closure request status, account restrictions and session counts.
- Existing subscription/trial directory and aggregated local workflow-job health.
- Dedicated append-only internal audit trail for sign-ins, denied sign-ins, metadata detail views, administrative mutations and aggregate exports. No private customer content or secret values are recorded. Database operators remain trusted; triggers do not substitute for off-host tamper-resistant audit storage.

## Explicitly not connected or not implemented

Payment processing, paid-seat accounting, revenue, trial conversion, cancellation cohorts, website analytics, product activity/online presence, historical security events, support case management, email delivery, monitoring/webhook providers, organisation lifecycle/entitlement editing and internal identity management UI are not implemented by this initial release. No placeholder revenue, fabricated live activity, fake invoices or payment status is shown. An existing subscription status is an operational record, not verified evidence of payment. Staff roles are configured server-side rather than editable from customer settings.

The supplied brief ends at section 6 after “Trial subscriptions”. The remaining requirements have been requested. This release is a secure initial foundation, not a claim that the complete business administration system is finished.

Before production: configure and verify real workforce MFA, TLS, role assignment/revocation, operational database backups, log retention and external monitoring. GitHub source backups exclude the database and environment secrets.

References: [openid-client authorization code validation](https://github.com/panva/openid-client/blob/main/docs/functions/authorizationCodeGrant.md), [Auth0 MFA verification and recent-authentication pattern](https://auth0.com/blog/preventing-destructive-actions-with-step-up-authentication/).

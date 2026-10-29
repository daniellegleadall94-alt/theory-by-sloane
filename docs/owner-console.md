# Theory Owner Console — initial release

Open `/owner` on the Theory server. This entry renders independently of the customer providers: it does not load the customer workspace, notes or credentials. Deployment must route `/owner` to the SPA entry and `/api/owner/*` to the API. No production domain has been selected or deployed.

## Current standard owner login

The console can use an explicitly authorised existing Theory account's email and password, without an external subscription. This is a separate owner session; a customer cookie or company-owner role alone never grants console access. No new password is created and no password is copied into owner configuration.

From the trusted server, after initialising the API database, run:

```
node scripts/owner-access.mjs --email YOUR_EXISTING_THEORY_EMAIL --grant
```

Use `--revoke` instead to remove access and invalidate that account's owner sessions immediately. The command restricts password owner access to one enabled account. Grants live only in the database, not in source code or customer-editable settings. Changing a password, suspending the account or removing its grant invalidates its owner sessions. Account recovery uses the existing Theory account process; email password recovery delivery is not configured, and this release does not pretend otherwise. There is no default password or console self-registration.

This interim password mode does **not** enforce MFA, as explicitly requested for the current stage. MFA-backed external sign-in remains available independently as described below. The UI identifies the standard login honestly and does not claim it has MFA.

Password verification reuses Theory's existing salted scrypt implementation. There are persistent account and IP attempt limits, a bounded password-check concurrency limit, generic login errors, same-origin JSON checks, and one-hour absolute / fifteen-minute idle session limits. Sessions are separate HttpOnly SameSite=Strict cookies, Secure on HTTPS; password login requires HTTPS outside loopback development. Privileged account mutations still require a recent owner sign-in and typed confirmation. The password owner cannot suspend their own owner account.

The existing Theory email and password are entered directly into `/owner`. Passwords are not written to browser storage, logs or audit events. No authentication subscription is needed for this mode. Production deployment still needs TLS and an operational recovery procedure.

## Optional MFA-backed external staff identity setup

Use a dedicated internal OpenID Connect application with mandatory MFA, for example an Auth0 workforce application. The existing `openid-client` library performs discovery, signature validation, authorization-code exchange, nonce/state and PKCE validation. Register an exact callback of `THEORY_OWNER_URL/api/owner/auth/callback`. Set the canonical origin (no path) and issuer, client ID and secret in server-only environment variables. Outside loopback development the origin must use HTTPS. Terminate TLS on the application server or configure the deployment to preserve the existing API same-origin checks; forwarded headers are not implicitly trusted.

Set `THEORY_OWNER_STAFF` to a JSON array of `{ "subject": "exact-provider-subject", "name": "Staff name", "roles": ["Platform Owner"] }`. Subjects are matched to the configured issuer; email and customer organisation roles never grant access. Multiple roles combine their permission sets. Optional `permissions` restricts a staff identity to an explicit subset of known permissions, configured by the operator on the server. Changes take effect on server restart, including revocation. Never place this configuration in a `VITE_` variable or commit real identity data or client secrets.

Six platform roles are supported: Platform Owner, Platform Administrator, Customer Support, Billing Administrator, Marketing / Growth Administrator and Technical Administrator. Their default permissions are defined in `server/owner-api.mjs`. There is no self-enrolment, default privileged account or customer-to-staff promotion route.

External staff sign-in requires a verified ID token with `amr` containing `mfa`, a recent `auth_time`, and an approved subject. Merely requesting MFA does not satisfy the server check. Configure the provider to perform an actual challenge for every staff login and emit these claims. Providers that do not emit this evidence are refused. Test with your real identity provider before production; automated tests use an injected isolated provider stub, never a production bypass. No OAuth tokens are retained or returned to the UI.

Staff cookies are HttpOnly, host-only, scoped to `/api/owner`, Secure on HTTPS, with a one-hour absolute lifetime and fifteen-minute idle timeout. Login uses a separate short-lived SameSite=Lax flow cookie and single-use state. Mutations require same-origin JSON. Suspending/reactivating customers or revoking their sessions requires the management permission, typed email confirmation and authentication within five minutes (MFA for external staff sign-in). Reauthenticate when prompted. Suspension blocks password and social session issuance and removes customer sessions; it does not delete customer records.

## Available now

- Executive totals for unique people, organisations, memberships, current trials and expiring trials. Registration date-range comparisons use UTC. Unknown legacy registration dates are not invented. Trial counts use existing organisation subscription records.
- Persisted per-staff dashboard order and hidden cards, date filters and permitted aggregate JSON export.
- Searchable, paginated user and organisation directories with deliberately selected metadata fields, user memberships and authentication-provider names, closure request status, account restrictions and session counts.
- Existing subscription/trial directory and aggregated local workflow-job health.
- Dedicated append-only internal audit trail for sign-ins, denied sign-ins, metadata detail views, administrative mutations and aggregate exports. No private customer content or secret values are recorded. Database operators remain trusted; triggers do not substitute for off-host tamper-resistant audit storage.

## Explicitly not connected or not implemented

Payment processing, paid-seat accounting, revenue, trial conversion, cancellation cohorts, website analytics, product activity/online presence, historical security events, support case management, email delivery, monitoring/webhook providers, organisation lifecycle/entitlement editing and internal identity management UI are not implemented by this initial release. No placeholder revenue, fabricated live activity, fake invoices or payment status is shown. An existing subscription status is an operational record, not verified evidence of payment. Staff roles are configured server-side rather than editable from customer settings.

The supplied brief ends at section 6 after “Trial subscriptions”. The remaining requirements have been requested. This release is a secure initial foundation, not a claim that the complete business administration system is finished.

Before production: verify the selected owner authentication method, TLS, explicit role assignment/revocation, account recovery, operational database backups, log retention and external monitoring. MFA can be added to password owner access in a later release. GitHub source backups exclude the database and environment secrets.

References: [openid-client authorization code validation](https://github.com/panva/openid-client/blob/main/docs/functions/authorizationCodeGrant.md), [Auth0 MFA verification and recent-authentication pattern](https://auth0.com/blog/preventing-destructive-actions-with-step-up-authentication/).

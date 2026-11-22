# Account email setup

Password recovery uses the existing salted-scrypt password format and a separately configured transactional mail adapter. The initial adapter uses Resend's documented `POST /emails` API with idempotency keys: https://resend.com/docs/api-reference/emails/send-email . No live mail account is configured in this checkout and automated tests use a fake transport.

The operator must set `THEORY_PUBLIC_URL` to the final HTTPS origin, `THEORY_MAIL_PROVIDER=resend`, a verified `THEORY_MAIL_FROM` sender and server-only `THEORY_MAIL_API_KEY`. Never use a VITE-prefixed secret or commit real configuration. Configure a verified sender/domain at the provider before enabling this. Existing email/password login does not depend on this service.

Recovery requests return the same message for known, unknown, suspended and provider-only accounts. Requests are limited by hashed account address and client network address; reset links are random, stored only as hashes, valid for 30 minutes and single-use. Email links carry the token in a fragment rather than a server-visible query string. The account page clears it from the address bar. Successful resets revoke customer sessions and password-based owner sessions; changing the password separately also invalidates outstanding reset links. Visiting a link never resets a password automatically.

Delivery failures do not expose recipient existence or provider responses. The affected link is invalidated. This first implementation sends directly with a bounded timeout and does not provide a durable delivery queue, bounce dashboard or email notification digests. Those remain separate work. The local preview does not demonstrate live email deliverability.

Login & Security can send verification to the current address or request a new address. Changes require the current password and confirmation while signed into the same account. The current address is unchanged until confirmation. Tokens bind to the original email and password state; address changes revoke existing sessions. Provider-only address changes remain unsupported.

Organisation invitations can now be emailed explicitly after generating a code. The server binds the recipient to the current invitation and organisation, rate-limits sends and uses an idempotency key. Provider acceptance is not delivery confirmation. Codes remain manually shareable when email is unconfigured or fails.

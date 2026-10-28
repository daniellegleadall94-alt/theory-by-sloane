# Google, Microsoft and LinkedIn sign-in

Social sign-in is implemented alongside the existing email/password flow. It is disabled until the application's provider credentials are configured. There are no credentials in the repository and no live provider sign-in was performed during implementation.

## Activate

1. Copy `.env.example` to `.env.local`.
2. Set `THEORY_PUBLIC_URL` to the canonical app origin. It must be HTTPS for hosting, or HTTP on a loopback host for development.
3. Register a Web application with each desired provider. Configure these exact redirect URIs, using the same origin and port as `THEORY_PUBLIC_URL`:
   - Google: `http://127.0.0.1:5173/api/auth/social/google/callback`
   - Microsoft: `http://127.0.0.1:5173/api/auth/social/microsoft/callback`
   - LinkedIn: `http://127.0.0.1:5173/api/auth/social/linkedin/callback`
4. Put client IDs and secrets in the matching `THEORY_*` server settings. Never use `VITE_` names for secrets. LinkedIn requires its Sign in with LinkedIn using OpenID Connect product. For Microsoft, register the desired supported account types; `common` supports the types enabled by that registration, while a tenant GUID limits the application to that tenant.
5. Restart the preview. The configured buttons become active. For port 5174, change the canonical URL and every registered callback accordingly. Avoid using both ports interchangeably during a login flow.

The app requests only `openid profile email`. Signing in does not connect social publishing, calendars, contacts or advertising accounts.

## Accounts and linking

A new social login starts in personal space. The user can create an organisation or accept a matching invitation afterwards. Existing accounts are never automatically merged by email. Sign in with the original method, then use **Workspace settings → Company & team / Your account → Linked sign-in methods** to explicitly add a provider. Provider identities are keyed by provider, issuer and subject. An identity cannot be attached to two Theory accounts.

Email/password users keep their existing accounts and memberships. Social-only accounts have no password login. Email-unverified social identities cannot accept email-addressed organisation invitations until a provider with a verified matching email is linked. Link flows verify that the initiating Theory session remains valid at callback time.

To preserve the existing schema's non-null legacy `users.company_id`, a social-only personal account has an inaccessible internal personal anchor. It has no membership and does not become an organisation or trial. Startup membership backfills exclude these personal accounts. New organisation memberships are created only by the existing explicit create/join operations.

## Protocol controls

The implementation uses `openid-client` with authorization code flow, S256 PKCE, state, nonce, ID-token signature validation and subject-checked UserInfo. Ten-minute, single-use flow records are bound to an HttpOnly SameSite=Lax browser cookie. Provider access/refresh tokens are not persisted. Theory sessions retain their existing HttpOnly SameSite=Strict cookies. Callbacks always return to the canonical application root, with predefined status messages; provider tokens and error details are never included in redirects.

Deploy behind HTTPS with trusted origin handling. The existing local server derives HTTPS from the socket; a hosted reverse proxy needs a deliberate, restricted trusted-proxy configuration before deployment.

## References

- [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)
- [Microsoft authorization code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow)
- [LinkedIn OpenID Connect](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2)
- [openid-client](https://github.com/panva/openid-client)

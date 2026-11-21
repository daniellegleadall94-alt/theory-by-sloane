# Enable Google and Microsoft sign-in

These are Theory login methods. Calendar permissions and calendar connections are separate. The integration code exists, but it has not been verified with live provider accounts in this workspace.

## Before starting

Use provider accounts owned by the Theory business. Decide whether you are configuring local testing or the eventual public HTTPS domain. Local callbacks work only on the computer running Theory; they do not make the site available to customers.

Do not paste client secrets into chat, commit them, or put them in browser code. Store them only in the server environment. `.env.local` is excluded from Git.

## Google

1. In Google Cloud, create or select the Theory project.
2. Configure Google Auth Platform branding, support contact and audience. Configure the intended test audience while preparing the application for public use.
3. Create an OAuth client of type **Web application**.
4. For the current local URL, register this exact authorised redirect URI:

   `http://127.0.0.1:5173/api/auth/social/google/callback`

5. Put the client ID and client secret in the server environment, using the keys below.

Official instructions: https://developers.google.com/identity/protocols/oauth2/web-server

## Microsoft

1. In Microsoft Entra, open App registrations → New registration.
2. Name the registration Theory. Select **Accounts in any organisational directory and personal Microsoft accounts** if both work and personal users should be supported. Theory defaults to the `common` authority.
3. Add a **Web** redirect URI. Theory exchanges the authorisation code on its backend; this is not an SPA token exchange.
4. The current local callback is:

   `http://127.0.0.1:5173/api/auth/social/microsoft/callback`

   Microsoft's portal does not accept an HTTP `127.0.0.1` URI through its ordinary redirect-URI text box; its documentation describes adding that loopback URI through the app manifest. An alternative is to configure `http://localhost:5173` consistently in both Theory and the provider registration and use that same host throughout sign-in. Mixing localhost and 127.0.0.1 can prevent the callback from finding its browser cookie.

5. Record the Application (client) ID. Under Certificates & secrets, create a client secret and store its **value**, not its secret identifier. Record the expiry so it can be replaced before expiring.

Official registration guide: https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app

Loopback redirect restrictions: https://learn.microsoft.com/en-us/entra/identity-platform/reply-url

## Theory server configuration

Create or update `.env.local` without replacing unrelated settings:

```dotenv
THEORY_PUBLIC_URL=http://127.0.0.1:5173
THEORY_GOOGLE_CLIENT_ID=your-google-client-id
THEORY_GOOGLE_CLIENT_SECRET=your-google-client-secret
THEORY_MICROSOFT_CLIENT_ID=your-microsoft-application-client-id
THEORY_MICROSOFT_CLIENT_SECRET=your-microsoft-client-secret-value
THEORY_MICROSOFT_TENANT=common
```

Restart the local server after changing its environment. The configured buttons should then become available. This indicates configuration is present; it does not prove that the provider registration is correct.

## Live checks before release

Test each provider's real sign-in, cancellation, new-account creation, explicit linking from an existing Theory account, sign-out and returning sign-in. Confirm that an existing email is not silently linked to another identity and that memberships and personal data remain correctly associated.

For public use, configure a production HTTPS URL, register its corresponding callback paths, and complete the providers' applicable publication, branding and verification requirements. Keep development and production registrations/credentials separate where practical. No live setup or verification is complete until these checks pass.

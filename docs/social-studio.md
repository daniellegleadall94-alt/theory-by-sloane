# Social Studio

Implemented 27 November 2026 in Marketing Tools → Social media. The Hepworth Website Social Studio and its documented planner/publisher informed this implementation; its administrator token-entry interface was deliberately replaced by platform sign-in and account discovery.

## Available without social provider setup

- Per-workspace posts with existing company associations, backend membership restrictions and record versions.
- Calendar and chronological post list, search, category/platform/status filters, drag rescheduling and CSV export.
- Categories/content pillars, six optional starter categories, reusable post examples, duplication, archive/restore.
- Shared media library using existing Theory file records; image upload, attachments and composer preview.
- Saved posting plans per platform, preferred weekdays/time, category rotation, preview and bounded generation of drafts. Existing occupied slots are skipped. Generated drafts never authorise publication.
- Manual publication tracking with an HTTPS published link.
- Legacy generic social records remain visible and are converted to the structured format when edited. Content-planning ideas remain in Content planning.

## Native account connection and delivery

Backend adapters implement Meta Facebook Pages and linked professional Instagram accounts, LinkedIn organisation pages and X accounts. The user flow is Connect → platform sign-in/consent → select an eligible page/profile. Company administrators connect shared accounts; personal connections belong to the individual. Customers do not enter tokens, application IDs or developer-console settings.

OAuth state is single-use, short-lived, bound to the originating browser and valid Theory session. X uses PKCE. Account tokens and verifiers use AES-256-GCM with authenticated record identifiers and a server-managed encryption key. Tokens are never returned to the browser. Refresh tokens are used when available; otherwise reconnect is required. Reconnecting invalidates previous approvals. Disconnecting deletes Theory's saved token; users can also revoke the app in their platform settings.

Publishing must be enabled by the operator after platform setup and live acceptance checks. A saved Ready post is explicitly approved against one selected account and a date/time. Jobs retain an immutable approved snapshot; edits and media-version changes invalidate delivery. Due jobs run at 30-second intervals while the server is continuously running. Duplicate active delivery is prevented by a database index and a claim before network submission. Interrupted/ambiguous outcomes become uncertain and require a manual platform check before retrying; no blind automatic retries. Posts more than 24 hours late fail for review. Failed permission checks stop delivery.

Initial publishing formats mirror Hepworth: text and a single JPG/PNG on Facebook, LinkedIn and X; a single JPG on Instagram. Instagram receives an expiring, unguessable HTTPS media link for the approved image. Reels, stories, video, carousels, inbox and live analytics are not implemented. X's 280-code-point limit is conservative rather than its full weighted-length algorithm.

## Operator setup (once for Theory, never each customer)

1. Establish a public HTTPS Theory origin and continuously running server. Set THEORY_PUBLIC_URL. The local laptop preview is not an always-on publishing service.
2. Register Theory with each platform and obtain the necessary platform approvals/products. Configure the exact callback URLs below, privacy policy and applicable platform data deletion/revocation requirements. Do not promise public onboarding until each app is approved for its intended customers.
3. Generate a cryptographically random 32-byte key, base64 encode it, and store it in the server secret manager as THEORY_SOCIAL_MASTER_KEY. Back it up separately from the database. Never commit it or paste it into chat. Loss of the key requires reconnecting accounts.
4. Configure the provider application credentials and supported API versions in the server environment. No credentials belong in VITE_* variables.
5. Leave THEORY_SOCIAL_PUBLISHING_ENABLED=false during setup. Complete consent, denied-consent, expiry, reconnect, account selection, revocation, media and live test-post checks using authorised test accounts. Then explicitly enable delivery.

Variables:

- THEORY_SOCIAL_META_CLIENT_ID / THEORY_SOCIAL_META_CLIENT_SECRET / THEORY_SOCIAL_META_VERSION
- THEORY_SOCIAL_LINKEDIN_CLIENT_ID / THEORY_SOCIAL_LINKEDIN_CLIENT_SECRET / THEORY_SOCIAL_LINKEDIN_VERSION
- THEORY_SOCIAL_X_CLIENT_ID / THEORY_SOCIAL_X_CLIENT_SECRET
- THEORY_SOCIAL_MASTER_KEY
- THEORY_SOCIAL_PUBLISHING_ENABLED (default false)

Callbacks:

- https://YOUR-THEORY-HOST/api/social/oauth/meta/callback
- https://YOUR-THEORY-HOST/api/social/oauth/linkedin/callback
- https://YOUR-THEORY-HOST/api/social/oauth/x/callback

Requested permissions:

- Meta: pages_show_list, pages_read_engagement, pages_manage_posts, instagram_basic, instagram_content_publish. Facebook page tasks must permit content creation. Instagram is discovered from the selected Facebook Page's instagram_business_account.
- LinkedIn: r_organization_admin, w_organization_social and approved Community Management access; supported API version required. Eligible organisation roles are ADMINISTRATOR and CONTENT_ADMINISTRATOR.
- X: tweet.read, tweet.write, users.read, offline.access, media.write. Platform API access/usage costs are separate from Theory membership; no purchasing or billing changes have been made.

Sources checked 27 November 2026:

- https://developers.facebook.com/documentation/facebook-login/guides/advanced/manual-flow
- https://developers.facebook.com/docs/graph-api/reference/page/
- https://developers.facebook.com/docs/pages-api/posts/
- https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow
- https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/organization-access-control-by-role
- https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api
- https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code

## Verification and limits

Automated tests use fictional accounts, isolated databases and mocked provider responses. They cover plan rotation/deduplication, London DST handling, OAuth state/session binding, encrypted storage, company isolation, explicit approval, edit locking, duplicate prevention, uncertain delivery and disconnect preservation. These do not substitute for live platform acceptance tests or a production security review. No real social accounts were connected or posts published during development. No domain/provider configuration has been supplied in this project yet.

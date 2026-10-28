# AI support panel

Use **AI support** in the header from any page. Select a provider, open connection settings, then supply a provider API key and an accessible model ID. Keys are private to the signed-in Theory account. Saved connections are marked as awaiting verification until an actual provider response succeeds. No shared Theory API subscription is bundled into this feature.

OpenAI, Anthropic Claude and Google Gemini have API adapters for chat inside the panel. Copilot and Perplexity offer explicit links to their own websites. The panel does not embed or log into consumer chat websites, import their history or use their subscriptions as API credentials. Disconnecting removes the saved Theory connection; it does not revoke the key at the provider.

Conversations remain in tab memory, separated by workspace, page, discipline and provider. Navigating elsewhere in the same workspace retains the panel and its conversations. Switching workspace resets in-memory conversations. Messages are not stored in the Theory database. Providers process requests under their own policies.

Only typed messages are sent by default. Users can add the current area labels or paste a task, note or brief into the context box, review it and explicitly include it. No task, note, file, page DOM or commercial data is automatically retrieved or attached. AI responses are plain text and cannot mutate workspace records. The user can copy a response into their work.

## Server boundaries

`server/ai-api.mjs` uses authenticated, same-origin endpoints and account-scoped connections. Provider hosts are fixed in the server; arbitrary endpoint URLs are not accepted. Model IDs, message roles, lengths, context approval and organisation membership are validated. Requests have a 45-second timeout, a per-account concurrency limit and a short burst limit. Provider errors never return credentials or raw provider payloads to the browser.

Keys are encrypted using AES-256-GCM with account/provider identity as authenticated data. The master key comes from `THEORY_AI_MASTER_KEY` (base64 encoding of 32 random bytes), or a locally generated `ai-master.key` alongside the SQLite database. Keys and the database must both be backed up and protected. The default `.data` directory is ignored by Git. For a hosted service, provide the master key through a server secret manager, restrict filesystem permissions and use HTTPS. Never use a `VITE_` environment variable for credentials or the master key.

The mocked API suite tests account isolation, missing credentials, explicit context approval, organisation permissions, provider routing, response parsing, key replacement/disconnection, encryption and error redaction. No real credentials were used or billable provider calls made during implementation. Live verification requires the user's credentials and provider model access.

## Official references

- [OpenAI text generation](https://developers.openai.com/api/docs/guides/text) and [API authentication](https://developers.openai.com/api/reference/overview).
- [Claude Messages](https://platform.claude.com/docs/en/api/messages/create) and [authentication](https://platform.claude.com/docs/en/manage-claude/authentication).
- [Gemini generateContent](https://ai.google.dev/api/generate-content) and [API key security](https://ai.google.dev/gemini-api/docs/api-key).

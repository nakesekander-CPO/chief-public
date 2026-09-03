# Chief

Chief is a self-hosted, AI-assisted executive operating system for decisions, commitments, meeting preparation, evidence, and carefully governed actions. Its operating rule is **read broadly, write narrowly, commit rarely**.

The app starts with an authenticated owner and empty personal workspaces. It does not load fictional records into a live account. Google Workspace, Microsoft 365, and OpenAI features remain disabled until the operator supplies server-side credentials and explicitly connects an account.

![Chief social preview](public/og.png)

## Contents

- [What Chief does](#what-chief-does)
- [Safety model](#safety-model)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Local setup](#local-setup)
- [Environment variables](#environment-variables)
- [OpenAI setup](#openai-setup)
- [Google Workspace setup](#google-workspace-setup)
- [Microsoft 365 setup](#microsoft-365-setup)
- [Using multiple workspaces](#using-multiple-workspaces)
- [Deploying with OpenAI Sites](#deploying-with-openai-sites)
- [Operating and maintaining Chief](#operating-and-maintaining-chief)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Publishing your own repository](#publishing-your-own-repository)
- [Known limitations](#known-limitations)

## What Chief does

- Produces an evidence-backed Today brief with one ruling and prioritized outcomes.
- Preserves source provenance, timestamps, connector identity, freshness, and truth state.
- Prepares meetings and extracts proposed commitments and decisions from notes.
- Requires individual approval before candidates enter commitment or decision ledgers.
- Tracks versioned decisions, supersession, and source-backed contradictions.
- Supports quick capture and workspace-scoped Ask Chief answers with citations.
- Creates Gmail or Outlook **drafts** and private calendar events only after an exact-payload approval.
- Records a user-visible audit timeline and blocks instruction-like content from untrusted sources.
- Supports up to 12 strictly isolated workspaces.
- Stores durable state in D1 with optimistic version checks and CSRF protection.
- Uses OAuth Authorization Code with PKCE and encrypts connector refresh tokens at rest.

Chief does **not** implement email sending, attendee invitations, source deletion, public publishing, financial transactions, legal submissions, employment decisions, or medical-treatment decisions.

## Safety model

Chief deliberately separates observation, judgment, approval, and execution:

1. A connector imports bounded source material into one workspace.
2. Imported material is `OBSERVED` evidence, never approved truth.
3. Deterministic code filters by workspace before ranking or synthesis.
4. AI output begins as a candidate or proposal.
5. The owner reviews the exact target and payload for any R2 write.
6. The connector rechecks workspace mapping, approval, and idempotency before writing.
7. The result is appended to the audit timeline.

Every record and operation carries a `workspaceId`. Validation rejects cross-workspace references, and OAuth tokens are keyed by owner, workspace, and provider. A connector attached to one workspace does not make its data available to another.

External email and calendar text is untrusted. It is never interpolated into system instructions. Policy decisions and action permissions remain deterministic; models can propose but cannot grant themselves tools or permissions.

Read [Security and privacy](docs/SECURITY.md) before connecting real accounts.

## Architecture

Chief is a TypeScript application built with React, Vinext, and a Next-compatible route layer. It produces a Cloudflare Worker-compatible bundle.

```text
Authenticated owner
        │
        ▼
   Chief UI ───────────────► versioned API routes
                                  │
             ┌────────────────────┼────────────────────┐
             ▼                    ▼                    ▼
      deterministic policy    D1 state          context builder
             │                                         │
             ▼                                         ▼
      approved connector ◄──── exact approval ◄── AI proposal
             │
             ▼
        audit event
```

- `app/` contains the UI and route handlers.
- `lib/` contains policy, retrieval, connector, workspace, job, and model logic.
- `db/` and `drizzle/` contain the D1 schema and migrations.
- `tests/` contains unit, adversarial, isolation, connector, and browser tests.
- `.openai/hosting.json` declares the Sites project and logical D1 binding.

See [Architecture](docs/ARCHITECTURE.md), [Data model](docs/DATA_MODEL.md), and the [architecture decisions](docs/adr/) for the design rationale.

## Prerequisites

- Node.js 22.13 or newer
- npm
- A modern Chromium-based browser for the optional end-to-end tests
- An OpenAI API key for live Ask Chief synthesis
- A Google Cloud project for Gmail/Google Calendar integration, if desired
- A Microsoft Entra tenant where you can register an application, if desired
- OpenAI Sites access for the supported hosted deployment path

The connectors and OpenAI integration are optional. The core app, local persistence, workspace controls, Quick Capture, approval UI, and tests run without them.

## Local setup

```bash
git clone YOUR_REPOSITORY_URL chief
cd chief
cp .env.example .env
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The development runtime supplies a local D1 database and a fictional/local owner identity from `.env`. Local state is stored beneath the ignored `.wrangler/` directory. Chief begins empty until you use Quick Capture or connect and sync a provider.

Generate a dedicated token-encryption secret before connecting Google or Microsoft:

```bash
openssl rand -base64 48
```

Copy the output into `TOKEN_ENCRYPTION_KEY` in `.env`. Never reuse a sample value and never commit `.env`.

## Environment variables

Copy `.env.example` to `.env` and fill only the integrations you want to use.

| Variable | Required | Purpose |
| --- | --- | --- |
| `CHIEF_OWNER_NAME` | Local only | Display name for the development identity. |
| `CHIEF_OWNER_EMAIL` | Local only | Email for the development identity. Use a fictional or test address in shared environments. |
| `CHIEF_LOCAL_IDENTITY` | No | Emergency non-Sites override. Never set this to `true` in production. Development already supplies a local identity. |
| `NEXT_PUBLIC_SITE_URL` | Yes when hosted | Trusted public origin used for metadata and OAuth callback construction. No trailing slash. |
| `TOKEN_ENCRYPTION_KEY` | For either connector | Long random secret used to derive the AES-GCM key that encrypts OAuth tokens in D1. |
| `OPENAI_API_KEY` | For Ask Chief | Server-only OpenAI API key. |
| `MODEL_REASONING` | No | Model used for higher-judgment work. |
| `MODEL_FAST` | No | Model used for lower-latency work. |
| `MODEL_EXTRACTION` | No | Model used for structured extraction. |
| `MODEL_EMBEDDING` | No | Reserved embedding model role. |
| `MODEL_TRANSCRIPTION` | No | Reserved transcription model role. |
| `MODEL_MAX_TURNS` | No | Maximum model turns per workflow. |
| `MODEL_MAX_TOOL_CALLS` | No | Maximum tool calls per workflow. |
| `MODEL_TIMEOUT_MS` | No | Model request timeout in milliseconds. |
| `MODEL_DAILY_BUDGET_USD` | No | Application budget guardrail. |
| `GOOGLE_CLIENT_ID` | For Google | OAuth web-client ID. |
| `GOOGLE_CLIENT_SECRET` | For Google | OAuth web-client secret; keep server-side. |
| `GOOGLE_REDIRECT_URI` | For Google | Exact callback URI registered with Google. |
| `MICROSOFT_CLIENT_ID` | For Microsoft | Entra Application (client) ID. |
| `MICROSOFT_CLIENT_SECRET` | For Microsoft | Entra client-secret value; keep server-side. |
| `MICROSOFT_TENANT_ID` | For Microsoft | Directory (tenant) ID. The connector is intentionally single-tenant. |
| `MICROSOFT_REDIRECT_URI` | For Microsoft | Exact Web callback URI registered in Entra. |

IDs are identifiers, not passwords, but keeping deployment-specific IDs out of examples prevents accidental coupling. Client secrets, API keys, encryption keys, OAuth authorization codes, access tokens, and refresh tokens are secrets.

## OpenAI setup

1. Create a project-scoped API key in the [OpenAI API dashboard](https://platform.openai.com/api-keys).
2. Put the key in local `.env` as `OPENAI_API_KEY`.
3. For a hosted deployment, add it as a server-side Sites secret instead of committing it.
4. Start Chief and check `/api/health`; `openai` should be `true`.

OpenAI recommends loading API keys from a server-side environment variable or key-management service and never exposing them in browser code. Chief calls the Responses API only from its server route. See the [OpenAI API authentication documentation](https://developers.openai.com/api/reference/overview#authentication).

If no key is configured, the rest of Chief remains available and `/api/ask` returns a controlled “Live model unavailable” response.

## Google Workspace setup

Chief uses a Web application OAuth client and these scopes:

- `openid`
- `email`
- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/gmail.compose`
- `https://www.googleapis.com/auth/calendar.readonly`
- `https://www.googleapis.com/auth/calendar.events.owned`

### Create the Google OAuth client

1. Create or select a project in [Google Cloud Console](https://console.cloud.google.com/).
2. Enable the **Gmail API** and **Google Calendar API** for that project.
3. Configure the Google Auth Platform branding, audience, and data-access pages.
4. If the app is in testing mode, add the Google accounts that will connect as test users.
5. Create an OAuth client with application type **Web application**.
6. Add the exact authorized redirect URIs:

   ```text
   http://localhost:3000/api/connections/google/callback
   https://YOUR_SITE_HOST/api/connections/google/callback
   ```

7. Copy the client ID and client secret into the corresponding local or hosted environment values.
8. Set `GOOGLE_REDIRECT_URI` to the callback for the environment currently running Chief.

Google requires the redirect URI to match exactly, including scheme, host, path, case, and trailing-slash behavior. See [Using OAuth 2.0 for Web Server Applications](https://developers.google.com/identity/protocols/oauth2/web-server).

### Important Google permission note

Chief’s code creates drafts with `users.drafts.create` and contains no Gmail send call. However, Google defines `gmail.compose` as permission to **manage drafts and send email**; Google does not offer a narrower draft-only scope for this API workflow. Both `gmail.readonly` and `gmail.compose` are restricted scopes, and a broadly distributed app may require OAuth verification and, when restricted-scope data is stored or transmitted on servers, a security assessment. Review [Google’s Gmail scope documentation](https://developers.google.com/workspace/gmail/api/auth/scopes) before distributing a Google-enabled deployment.

For a private personal deployment, keep the OAuth audience and test-user list as narrow as possible. Do not present the absence of a send endpoint as equivalent to an OAuth-level technical prohibition.

## Microsoft 365 setup

Chief uses Microsoft identity-platform Authorization Code with PKCE and delegated permissions:

- OpenID scopes: `openid`, `profile`, `email`, `offline_access`
- Microsoft Graph: `User.Read`, `Mail.ReadWrite`, `Calendars.ReadWrite`

It does not request `Mail.Send`, shared-mailbox, shared-calendar, Files, Contacts, Directory, Chat, or SharePoint permissions. Microsoft documents that delegated `Mail.ReadWrite` does not include permission to send mail. `Calendars.ReadWrite` does allow creating, reading, updating, and deleting events in the signed-in user’s calendars; Chief’s own policy narrows writes to new private events with no attendees.

### Register the Entra application

1. Sign in to the [Microsoft Entra admin center](https://entra.microsoft.com/).
2. Open **Entra ID → App registrations → New registration**.
3. Give the app a recognizable name.
4. Choose **Accounts in this organizational directory only**. This repository’s Microsoft connector is intentionally single-tenant.
5. Register the app and record the **Application (client) ID** and **Directory (tenant) ID** from Overview.
6. Open **Authentication → Add a platform → Web** and register:

   ```text
   http://localhost:3000/api/connections/microsoft/callback
   https://YOUR_SITE_HOST/api/connections/microsoft/callback
   ```

7. Open **API permissions → Add a permission → Microsoft Graph → Delegated permissions** and add:

   ```text
   User.Read
   Mail.ReadWrite
   Calendars.ReadWrite
   ```

8. Open **Certificates & secrets**, create a short-lived client secret, and copy the **secret value** immediately. The value is shown only once.
9. Put the client ID, secret value, tenant ID, and active environment’s callback URI into the corresponding environment variables.
10. Start Chief and check `/api/health`; `microsoft` should be `true`.

Microsoft recommends single-tenant registration for most internal applications. Redirect URIs for this server flow must be registered as the **Web** platform. See Microsoft’s guides for [registering an application](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app), [adding a redirect URI](https://learn.microsoft.com/en-us/entra/identity-platform/how-to-add-redirect-uri), and the [Graph permission definitions](https://learn.microsoft.com/en-us/graph/permissions-reference).

Your organization’s consent policy may require an administrator to approve the requested delegated permissions. That is an external tenant decision; Chief cannot bypass it. Prefer a certificate or federated credential for a future production-hardening pass—this version currently implements client-secret authentication, so rotate the secret before expiry and immediately after any suspected disclosure.

## Using multiple workspaces

1. Sign in and open **Settings**.
2. Create a workspace for the data boundary you need—for example, “Company A,” “Company B,” or “Private Office.”
3. Switch to that workspace before selecting **Connect Google** or **Connect Microsoft**.
4. Complete provider consent.
5. Return to the same workspace and choose **Sync now**.
6. Repeat with a different workspace and provider account as needed.

Connections are mapped to the active workspace at authorization time. Sync imports at most 20 recent inbox items and 30 near-term calendar events. Switching workspaces changes the entire visible and retrievable state boundary; it is not merely a UI filter.

Do not connect the same organizational data to multiple workspaces unless you intentionally want duplicate, independently governed copies. Creating a workspace does not copy data from an existing workspace.

## Deploying with OpenAI Sites

OpenAI Sites is the supported hosted path for this repository because it supplies the authenticated owner boundary, Cloudflare Worker runtime, D1 binding, migrations, environment management, and deployment flow.

1. Run the complete local check:

   ```bash
   npm run check
   ```

2. Open `.openai/hosting.json`. A public copy should contain a placeholder project ID and the logical D1 binding:

   ```json
   {
     "project_id": "REPLACE_WITH_YOUR_SITES_PROJECT_ID",
     "d1": "DB",
     "r2": null
   }
   ```

3. Create a new Site for your own account/project through Codex and let the Sites workflow replace the placeholder with your own project ID. Never reuse another operator’s Sites project ID.
4. Add the environment values through the Site’s environment controls. Mark API keys, OAuth client secrets, and `TOKEN_ENCRYPTION_KEY` as secrets.
5. Set `NEXT_PUBLIC_SITE_URL` to the final HTTPS origin.
6. Register the production Google/Microsoft callback URLs exactly, then update `GOOGLE_REDIRECT_URI` and `MICROSOFT_REDIRECT_URI` to those same values.
7. Deploy only after verifying the Site is owner-only or otherwise has the exact access policy you intend.
8. Connect real accounts only after the deployed `/api/health` reports the intended integrations as configured.

Do not put hosted values in `.env.example`, `.openai/hosting.json`, source files, Git remotes, issue screenshots, build logs, or deployment archives. The repository does not need an R2 bucket in its current form.

## Operating and maintaining Chief

### Health

`GET /api/health` reports liveness and whether OpenAI, Google, and Microsoft configuration is complete. It returns booleans, not credential values.

### Disconnecting and revoking

Disconnecting a provider removes Chief’s encrypted local authorization. For full revocation, also remove the app’s access in Google Account permissions or Microsoft Entra/your Microsoft account, as applicable.

### Secret rotation

- Rotate OAuth client secrets before they expire.
- Rotate immediately after suspected exposure.
- Treat `TOKEN_ENCRYPTION_KEY` rotation as a data migration: old encrypted tokens cannot be decrypted with a new key. Reconnect accounts unless you implement versioned re-encryption first.
- Revoke an exposed OpenAI API key in the OpenAI dashboard and replace the hosted/local secret.

### Local reset

To reset local D1 state without permanently deleting it, stop the development server and move the project-local runtime directory aside:

```bash
mv .wrangler ".wrangler.backup-$(date +%Y%m%d-%H%M%S)"
npm run dev
```

The next start creates fresh local state. Restore only while the server is stopped.

### Backups

For production data, use a D1 export or point-in-time recovery process appropriate to the hosting environment. Restore into a separate database first and verify workspace counts, connector mappings, and audit continuity before switching bindings.

Read the [Runbook](docs/RUNBOOK.md) for failure behavior, backup/restore expectations, and incident response.

## Testing

```bash
npm run lint           # ESLint
npm run typecheck      # strict TypeScript
npm run test           # unit, policy, connector, isolation, and eval tests
npm run eval           # adversarial fixtures only
npm run test:e2e       # Chromium desktop and mobile journeys
npm run test:coverage  # coverage report
npm run db:generate    # generate a reviewed D1 migration
npm run build          # production Worker bundle
npm run check          # lint + typecheck + unit tests + production build
```

Run `npm run check` before every push. Run `npm run test:e2e` after interaction, navigation, responsive, authentication, connector, or approval-flow changes.

Schema changes require a generated migration. Inspect the SQL before committing it; never treat generated migration output as automatically safe.

## Troubleshooting

### A connector says it is unavailable

One or more required variables is missing. Google requires its client ID, client secret, redirect URI, and `TOKEN_ENCRYPTION_KEY`. Microsoft requires those equivalents plus `MICROSOFT_TENANT_ID`. Check `/api/health` after restarting the app.

### `redirect_uri_mismatch` or an Entra redirect error

The configured callback and provider registration differ. Compare the entire value: scheme, host, port, path, case, and trailing slash. Local and production callbacks must each be registered.

### Google shows an unverified-app warning or blocks access

Confirm the OAuth audience and test-user list. Gmail’s requested scopes are restricted. Wider distribution can require Google verification and a security assessment; do not work around those controls.

### Microsoft says “Approval required”

Your tenant’s user-consent policy requires an administrator. Submit the exact requested delegated permissions and explain the app’s purpose to the tenant administrator. Do not add application permissions or `Mail.Send` as a workaround.

### Ask Chief returns 503

`OPENAI_API_KEY` is absent from the server environment. Add it, restart/redeploy, and check `/api/health`. Never put the key in a `NEXT_PUBLIC_*` variable.

### Connected accounts fail after changing `TOKEN_ENCRYPTION_KEY`

Existing OAuth tokens were encrypted with the previous key. Restore the previous key or disconnect/reconnect each account. Do not repeatedly retry with mismatched keys.

### A write appears twice

Stop further execution and inspect the approval and audit records. Connector writes are provider- and workspace-scoped by idempotency key; duplicate remote objects indicate that boundary needs investigation before retrying.

## Publishing your own repository

This source tree is intended to be published without local state or credentials. Before pushing, confirm that only examples and placeholders are tracked:

```bash
git status --short
git ls-files | grep -E '(^|/)(\.env|.*secret|.*credential|.*\.pem|.*\.key)' || true
git grep -n -E '(sk-[A-Za-z0-9_-]{20,}|client_secret|refresh_token|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY)' || true
```

If [Gitleaks](https://github.com/gitleaks/gitleaks) is installed, scan both the files and Git history:

```bash
gitleaks dir . --redact
gitleaks git . --redact
```

Then create an empty repository on your Git host and push:

```bash
git remote add origin git@github.com:YOUR_ACCOUNT/YOUR_REPOSITORY.git
git push -u origin main
```

If `origin` already exists, inspect it with `git remote -v` and update it intentionally instead of adding a duplicate. Do not embed access tokens in remote URLs. Use your Git host’s credential manager or SSH authentication.

This repository intentionally ignores `.env*` files except `.env.example`, local D1 state, test artifacts, build output, deployment archives, private keys, client-secret downloads, and common credential files. Ignore rules are a backstop, not a substitute for scanning.

No software license has been selected. Add a license that matches your intended sharing and contribution terms before inviting others to reuse or redistribute the project.

## Known limitations

- Google and Microsoft sync use bounded latest-window refreshes; incremental provider cursors and cancellation reconciliation are future work.
- D1 stores the typed workspace document atomically, while connector accounts, OAuth state, idempotent executions, and migrations use dedicated tables.
- Scheduled workflows are modeled and tested as durable state machines but are not registered with a production scheduler.
- The Microsoft connector is single-tenant. Each organization should deploy and register its own Entra application.
- The current Microsoft implementation uses a client secret; certificate or workload-identity support is future production hardening.
- Gmail’s draft-capable OAuth scope also permits sending at the provider authorization layer, even though Chief implements no send endpoint.
- Google restricted-scope verification/security-assessment requirements may make public multi-user distribution impractical without additional compliance work.
- File ingestion, upload scanning, incremental key rotation, durable distributed rate limiting, and independent penetration testing are not yet implemented.
- Chief is designed for owner-only deployment. Do not expose it as a general multi-user service without a separate security and tenancy review.

This project is not a substitute for legal, financial, medical, employment, security, or compliance advice. Review every consequential action yourself.

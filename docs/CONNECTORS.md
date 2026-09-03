# Connectors

`ExecutiveConnector` is the domain boundary. Every method receives authenticated user, workspace, connected-account mapping, and approval context. Provider capabilities never grant policy permission.

The production adapters use OAuth Authorization Code with PKCE. OAuth state is provider-specific, single-use, and expires after ten minutes; access and refresh tokens are AES-GCM encrypted in D1. Each account authorization is mapped to exactly one Chief workspace. Every token lookup and idempotency check includes owner, workspace, and provider.

## Production Google setup

Create a Google Web application OAuth client, enable the Gmail and Calendar APIs, and register the exact local and production callback URLs. Chief requests Gmail read-only plus compose, Calendar read-only plus owned-event write, and OpenID email. The implementation contains no Gmail send or delete call and requests no Contacts or Drive scope. Google nevertheless defines `gmail.compose` as permission to manage drafts **and send email**; there is no narrower draft-only scope for this API workflow. Treat that provider-level capability and Google's restricted-scope verification requirements as deployment risks.

Current sync imports a bounded window of up to 20 Gmail threads and 30 Calendar events. Gmail snippets and Calendar descriptions are sanitized and treated as untrusted observations. The next connector slice should persist Gmail history IDs and Calendar sync tokens for incremental changes and cancellations.

Approved Gmail writes call `users.drafts.create`; there is no send capability. Approved Calendar writes insert events with an empty attendee list and `sendUpdates=none`. Provider IDs are recorded against an owner-scoped idempotency key so retries return the existing result.

## Production Microsoft 365 setup

Register a single-tenant Web application in Microsoft Entra ID and add the exact local and production callback URLs. Chief requests delegated OpenID identity, `User.Read`, `Mail.ReadWrite`, and `Calendars.ReadWrite` with offline access. It deliberately omits `Mail.Send`, file, contacts, directory, chat, and SharePoint scopes.

The bounded sync reads up to 20 recent Outlook inbox messages and 30 near-term calendar events using Microsoft Graph. Message previews and event descriptions are sanitized and remain untrusted observations. An approved Outlook email action creates a draft with `POST /me/messages`; it never calls a send endpoint. An approved Microsoft calendar action creates a private event with no attendees and no online meeting.

Microsoft disconnect removes Chief's encrypted local authorization. The user or tenant administrator can separately revoke the enterprise application's consent in Microsoft account or Entra controls.

Future adapters must implement the same boundary for Teams, generic MCP, file sources, CRM, and Markdown vaults. Add contract tests, health state, scopes, cursor behavior, retry policy, audit redaction, and a workspace-leakage fixture.

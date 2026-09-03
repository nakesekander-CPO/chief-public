import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  timeZone: text('time_zone').notNull().default('Europe/Dublin'),
  createdAt: text('created_at').notNull(),
}, (table) => [uniqueIndex('idx_users_email').on(table.email)]);

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  type: text('type').notNull(),
  classification: text('classification').notNull(),
  defaultTimeZone: text('default_time_zone').notNull(),
  crossWorkspaceAccess: integer('cross_workspace_access', { mode: 'boolean' }).notNull().default(false),
  archivedAt: text('archived_at'),
}, (table) => [uniqueIndex('idx_workspaces_owner_slug').on(table.ownerId, table.slug)]);

export const memberships = sqliteTable('memberships', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  role: text('role').notNull(),
}, (table) => [uniqueIndex('idx_memberships_user_workspace').on(table.userId, table.workspaceId)]);

export const sourceItems = sqliteTable('source_items', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  provider: text('provider').notNull().default('GOOGLE'),
  externalId: text('external_id'),
  contentType: text('content_type').notNull(),
  title: text('title').notNull(),
  normalizedText: text('normalized_text').notNull(),
  contentHash: text('content_hash').notNull(),
  trustState: text('trust_state').notNull(),
  createdAt: text('created_at').notNull(),
  deletedAt: text('deleted_at'),
}, (table) => [
  index('idx_source_items_workspace_created').on(table.workspaceId, table.createdAt),
  uniqueIndex('idx_source_items_workspace_provider_external').on(table.workspaceId, table.provider, table.externalId),
]);

export const commitments = sqliteTable('commitments', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  statement: text('statement').notNull(),
  owner: text('owner').notNull(),
  promisee: text('promisee').notNull(),
  dueDate: text('due_date'),
  status: text('status').notNull(),
  risk: text('risk').notNull(),
  version: integer('version').notNull().default(1),
  approvedBy: text('approved_by'),
  approvedAt: text('approved_at'),
}, (table) => [index('idx_commitments_workspace_status_due').on(table.workspaceId, table.status, table.dueDate)]);

export const decisions = sqliteTable('decisions', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  title: text('title').notNull(),
  ruling: text('ruling').notNull(),
  rationale: text('rationale').notNull(),
  status: text('status').notNull(),
  version: integer('version').notNull().default(1),
  supersedesId: text('supersedes_id'),
  supersededById: text('superseded_by_id'),
  approvedBy: text('approved_by'),
  approvedAt: text('approved_at'),
}, (table) => [index('idx_decisions_workspace_status').on(table.workspaceId, table.status)]);

export const approvals = sqliteTable('approvals', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  actionType: text('action_type').notNull(),
  exactPayload: text('exact_payload').notNull(),
  riskTier: text('risk_tier').notNull(),
  status: text('status').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  createdAt: text('created_at').notNull(),
  executedAt: text('executed_at'),
}, (table) => [
  index('idx_approvals_workspace_status').on(table.workspaceId, table.status),
  uniqueIndex('idx_approvals_idempotency').on(table.idempotencyKey),
]);

export const auditEvents = sqliteTable('audit_events', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  actorId: text('actor_id').notNull(),
  action: text('action').notNull(),
  detail: text('detail').notNull(),
  riskTier: text('risk_tier').notNull(),
  outcome: text('outcome').notNull(),
  requestId: text('request_id').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [index('idx_audit_workspace_created').on(table.workspaceId, table.createdAt)]);

export const appSnapshots = sqliteTable('app_snapshots', {
  ownerId: text('owner_id').primaryKey(),
  version: integer('version').notNull(),
  stateJson: text('state_json').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const connectorAccounts = sqliteTable('connector_accounts', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  workspaceId: text('workspace_id').notNull(),
  provider: text('provider').notNull().default('GOOGLE'),
  email: text('email').notNull(),
  accessTokenCipher: text('access_token_cipher').notNull(),
  refreshTokenCipher: text('refresh_token_cipher'),
  expiresAt: integer('expires_at').notNull(),
  scopes: text('scopes').notNull(),
  status: text('status').notNull(),
  lastSyncedAt: text('last_synced_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_connector_owner_workspace_provider').on(table.ownerId, table.workspaceId, table.provider),
]);

export const oauthStates = sqliteTable('oauth_states', {
  stateHash: text('state_hash').primaryKey(),
  ownerId: text('owner_id').notNull(),
  workspaceId: text('workspace_id').notNull(),
  provider: text('provider').notNull().default('GOOGLE'),
  codeVerifierCipher: text('code_verifier_cipher').notNull(),
  expiresAt: integer('expires_at').notNull(),
  usedAt: text('used_at'),
}, (table) => [index('idx_oauth_states_owner_expires').on(table.ownerId, table.expiresAt)]);

export const connectorExecutions = sqliteTable('connector_executions', {
  idempotencyKey: text('idempotency_key').primaryKey(),
  ownerId: text('owner_id').notNull(),
  workspaceId: text('workspace_id').notNull(),
  provider: text('provider').notNull().default('GOOGLE'),
  actionType: text('action_type').notNull(),
  providerId: text('provider_id').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [index('idx_connector_executions_owner_workspace').on(table.ownerId, table.workspaceId)]);

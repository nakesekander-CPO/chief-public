import type { AppState, Workspace, WorkspaceId } from './types';

export const MAX_WORKSPACES = 12;
export const WORKSPACE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{1,63}$/;

export function isWorkspaceId(value: unknown): value is WorkspaceId {
  return typeof value === 'string' && WORKSPACE_ID_PATTERN.test(value);
}

export function ownsWorkspace(state: AppState, workspaceId: string): workspaceId is WorkspaceId {
  return isWorkspaceId(workspaceId) && state.workspaces.some((workspace) => workspace.id === workspaceId);
}

export function createWorkspaceState(
  state: AppState,
  input: { name: string; classification: Workspace['classification']; type: string },
): { state: AppState; workspace: Workspace } {
  if (state.workspaces.length >= MAX_WORKSPACES) throw new WorkspaceBoundaryError(`Chief supports up to ${MAX_WORKSPACES} active workspaces.`);
  const name = input.name.trim();
  if (!name) throw new WorkspaceBoundaryError('Workspace name is required.');
  if (state.workspaces.some((workspace) => workspace.name.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0)) {
    throw new WorkspaceBoundaryError('A workspace with that name already exists.');
  }
  const workspace: Workspace = {
    id: `ws-${crypto.randomUUID()}`,
    name,
    type: input.type.trim() || 'Professional',
    classification: input.classification,
    defaultTimeZone: 'Europe/Dublin',
  };
  return {
    workspace,
    state: {
      ...state,
      workspaces: [...state.workspaces, workspace],
      briefs: [...state.briefs, {
        workspaceId: workspace.id,
        ruling: 'This workspace is isolated and ready for authorized evidence.',
        rationale: 'Connect one or more accounts to this workspace. Chief filters by this workspace before retrieval, ranking, or action.',
        outcomeIds: [],
        ignoredCount: 0,
      }],
      audit: [{
        id: `audit-workspace-${crypto.randomUUID()}`,
        workspaceId: workspace.id,
        timestamp: 'Just now',
        actor: state.owner.name,
        action: 'Created isolated workspace',
        detail: `${workspace.name} was created with cross-workspace retrieval disabled. No connector or record was copied into it.`,
        riskTier: 'R0',
        outcome: 'SUCCEEDED',
      }, ...state.audit],
    },
  };
}

export function hasValidWorkspaceIsolation(state: AppState): boolean {
  if (!state.workspaces.length || state.workspaces.length > MAX_WORKSPACES) return false;
  const workspaceIds = new Set(state.workspaces.map((workspace) => workspace.id));
  if (workspaceIds.size !== state.workspaces.length || [...workspaceIds].some((id) => !isWorkspaceId(id))) return false;
  const scopedCollections = [
    state.briefs, state.outcomes, state.sources, state.people, state.meetings, state.commitments,
    state.decisions, state.candidates, state.approvals, state.audit, state.inbox, state.captures,
  ] as Array<Array<{ workspaceId: WorkspaceId }>>;
  if (!scopedCollections.every((items) => items.every((item) => workspaceIds.has(item.workspaceId)))) return false;

  const sourceWorkspace = new Map(state.sources.map((item) => [item.id, item.workspaceId]));
  const outcomeWorkspace = new Map(state.outcomes.map((item) => [item.id, item.workspaceId]));
  const personWorkspace = new Map(state.people.map((item) => [item.id, item.workspaceId]));
  const sourcesStayScoped = (workspaceId: WorkspaceId, ids: string[]) => ids.every((id) => sourceWorkspace.get(id) === workspaceId);
  if (!state.outcomes.every((item) => sourcesStayScoped(item.workspaceId, item.sourceIds))) return false;
  if (!state.commitments.every((item) => sourcesStayScoped(item.workspaceId, item.sourceIds))) return false;
  if (!state.decisions.every((item) => sourcesStayScoped(item.workspaceId, item.sourceIds))) return false;
  if (!state.candidates.every((item) => sourcesStayScoped(item.workspaceId, item.sourceIds))) return false;
  if (!state.approvals.every((item) => sourcesStayScoped(item.workspaceId, item.sourceIds))) return false;
  if (!state.inbox.every((item) => sourceWorkspace.get(item.sourceId) === item.workspaceId)) return false;
  if (!state.meetings.every((item) => sourcesStayScoped(item.workspaceId, item.prep.sourceIds)
    && item.participantIds.every((id) => personWorkspace.get(id) === item.workspaceId))) return false;
  return state.briefs.every((item) => item.outcomeIds.every((id) => outcomeWorkspace.get(id) === item.workspaceId));
}

export class WorkspaceBoundaryError extends Error {}

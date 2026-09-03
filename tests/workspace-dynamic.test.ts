import { describe, expect, it } from 'vitest';
import { freshPersonalState } from '../lib/personal';
import { createWorkspaceState, hasValidWorkspaceIsolation, MAX_WORKSPACES, WorkspaceBoundaryError } from '../lib/workspaces';

describe('dynamic workspace boundaries', () => {
  it('creates a distinct empty workspace without copying records', () => {
    const initial = freshPersonalState('Alex Morgan', 'alex@example.test');
    const { state, workspace } = createWorkspaceState(initial, { name: 'Office 365 Work', type: 'Professional', classification: 'Confidential' });
    expect(state.workspaces).toHaveLength(initial.workspaces.length + 1);
    expect(workspace.id).toMatch(/^ws-[a-f0-9-]+$/);
    expect(state.sources.filter((item) => item.workspaceId === workspace.id)).toHaveLength(0);
    expect(state.briefs.find((item) => item.workspaceId === workspace.id)?.outcomeIds).toEqual([]);
    expect(hasValidWorkspaceIsolation(state)).toBe(true);
  });

  it('rejects cross-workspace source references', () => {
    const initial = freshPersonalState('Alex Morgan', 'alex@example.test');
    const { state, workspace } = createWorkspaceState(initial, { name: 'Client Work', type: 'Professional', classification: 'Confidential' });
    const invalid = {
      ...state,
      sources: [{ id: 'source-one', workspaceId: 'northstar', type: 'Email' as const, title: 'Private source', author: 'Owner', timestamp: 'Now', ingestedAt: 'Now', excerpt: 'Evidence', truthState: 'OBSERVED' as const, connector: 'Test', freshness: 'Now' }],
      outcomes: [{ id: 'outcome-one', workspaceId: workspace.id, category: 'DO' as const, title: 'Leaked result', whyNow: 'Now', consequence: 'Boundary failure', recommendation: 'Reject', sourceIds: ['source-one'], priority: 5 }],
    };
    expect(hasValidWorkspaceIsolation(invalid)).toBe(false);
  });

  it('enforces unique names and the workspace cap', () => {
    const initial = freshPersonalState('Alex Morgan', 'alex@example.test');
    expect(() => createWorkspaceState(initial, { name: 'work', type: 'Professional', classification: 'Confidential' })).toThrow(WorkspaceBoundaryError);
    const full = { ...initial, workspaces: Array.from({ length: MAX_WORKSPACES }, (_, index) => ({ ...initial.workspaces[0], id: `workspace-${index}`, name: `Workspace ${index}` })) };
    expect(() => createWorkspaceState(full, { name: 'One more', type: 'Professional', classification: 'Confidential' })).toThrow(/up to 12/);
  });
});

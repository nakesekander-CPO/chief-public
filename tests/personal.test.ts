import { describe, expect, it } from 'vitest';
import { freshPersonalState, isLegacyDemoState } from '../lib/personal';
import { freshSeedState } from '../lib/seed';

describe('personal activation', () => {
  it('starts with owner-scoped empty workspaces and no fictional evidence', () => {
    const state = freshPersonalState('Alex Morgan', 'alex@example.test');
    expect(state.mode).toBe('PERSONAL');
    expect(state.owner).toEqual({ name: 'Alex Morgan', email: 'alex@example.test', initials: 'AM' });
    expect(state.workspaces.map((workspace) => workspace.name)).toEqual(['Work', 'Private Office']);
    expect(state.sources).toHaveLength(0);
    expect(state.inbox).toHaveLength(0);
    expect(state.meetings).toHaveLength(0);
    expect(JSON.stringify(state)).not.toMatch(/demo account|fictional data/i);
  });

  it('recognizes the former sample state for one-time migration', () => {
    expect(isLegacyDemoState(freshSeedState())).toBe(true);
    expect(isLegacyDemoState(freshPersonalState())).toBe(false);
  });
});

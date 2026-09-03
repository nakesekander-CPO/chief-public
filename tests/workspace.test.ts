import { describe, expect, it } from 'vitest';
import { freshSeedState } from '../lib/seed';

function retrieve(workspaceId: 'northstar' | 'private', query: string) {
  const state = freshSeedState();
  const terms = query.toLowerCase().split(/\W+/).filter((term) => term.length > 3);
  return state.sources.filter((source) => source.workspaceId === workspaceId && terms.some((term) => `${source.title} ${source.excerpt}`.toLowerCase().includes(term)));
}

describe('workspace isolation', () => {
  it('never returns a similarly relevant record from another workspace', () => {
    const companyResults = retrieve('northstar', 'partner launch mortgage');
    expect(companyResults.length).toBeGreaterThan(0);
    expect(companyResults.every((source) => source.workspaceId === 'northstar')).toBe(true);
    expect(companyResults.some((source) => source.id === 'src-mortgage')).toBe(false);
  });

  it('keeps superseded decisions out of active truth', () => {
    const state = freshSeedState();
    const active = state.decisions.filter((decision) => decision.workspaceId === 'northstar' && decision.status === 'ACTIVE');
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe('dec-quality');
    expect(state.decisions.find((decision) => decision.id === 'dec-open-beta')?.supersededBy).toBe('dec-quality');
  });

  it('uses only fictional demo identities and providers', () => {
    const state = freshSeedState();
    expect(state.sources.every((source) => /Demo|Chief|Uploaded/i.test(source.connector))).toBe(true);
    expect(JSON.stringify(state)).not.toMatch(/api[_-]?key|refresh[_-]?token/i);
  });
});

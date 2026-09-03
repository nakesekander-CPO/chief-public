import { describe, expect, it } from 'vitest';
import { assembleContext } from '../lib/context';
import { freshSeedState } from '../lib/seed';

describe('central context assembly', () => {
  it('filters by workspace before ranking', () => {
    const context = assembleContext(freshSeedState(), 'northstar', 'launch partner mortgage');
    expect(context.sources.length).toBeGreaterThan(0);
    expect(context.sources.every((source) => source.workspaceId === 'northstar')).toBe(true);
    expect(context.citationMap['src-mortgage']).toBeUndefined();
  });

  it('ranks approved truth over superseded history', () => {
    const context = assembleContext(freshSeedState(), 'northstar', 'open beta target September');
    expect(context.sources[0].id).toBe('src-decision-quality');
    expect(context.sources.findIndex((source) => source.id === 'src-partner-old')).toBeGreaterThan(0);
  });

  it('returns bounded context with visible omission count', () => {
    const context = assembleContext(freshSeedState(), 'northstar', 'partner launch onboarding', 1);
    expect(context.sources).toHaveLength(1);
    expect(context.omittedCount).toBeGreaterThan(0);
  });
});

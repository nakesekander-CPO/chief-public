import type { AppState, SourceItem, WorkspaceId } from './types';

export interface ContextPackage {
  workspaceId: WorkspaceId;
  sources: SourceItem[];
  omittedCount: number;
  citationMap: Record<string, { title: string; excerpt: string }>;
}

export function assembleContext(state: AppState, workspaceId: WorkspaceId, query: string, limit = 8): ContextPackage {
  const terms = query.toLowerCase().split(/\W+/).filter((term) => term.length > 2);
  const authorized = state.sources.filter((source) => source.workspaceId === workspaceId && source.truthState !== 'REJECTED');
  const ranked = authorized.map((source) => {
    const haystack = `${source.title} ${source.author} ${source.excerpt}`.toLowerCase();
    const lexical = terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
    const truthBoost = source.truthState === 'APPROVED' ? 2 : source.truthState === 'SUPERSEDED' ? -2 : 0;
    const suspiciousPenalty = source.suspicious ? -3 : 0;
    return { source, score: lexical + truthBoost + suspiciousPenalty };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.source.id.localeCompare(b.source.id));
  const sources = ranked.slice(0, Math.max(0, limit)).map((item) => item.source);
  return {
    workspaceId,
    sources,
    omittedCount: Math.max(0, ranked.length - sources.length),
    citationMap: Object.fromEntries(sources.map((source) => [source.id, { title: source.title, excerpt: source.excerpt }])),
  };
}

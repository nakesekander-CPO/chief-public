import { editorialStandard } from './seed';
import type { AppState } from './types';

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'ME';
}

export function freshPersonalState(name = 'You', email?: string): AppState {
  const ownerName = name.trim() || email?.split('@')[0] || 'You';
  const workspaces = [
    { id: 'northstar' as const, name: 'Work', type: 'Professional', classification: 'Confidential' as const, defaultTimeZone: 'Europe/Dublin' },
    { id: 'private' as const, name: 'Private Office', type: 'Personal administration', classification: 'Private' as const, defaultTimeZone: 'Europe/Dublin' },
  ];
  return {
    version: 1,
    mode: 'PERSONAL',
    owner: { name: ownerName, email, initials: initials(ownerName) },
    workspaces,
    briefs: workspaces.map((workspace) => ({
      workspaceId: workspace.id,
      ruling: 'Your workspace is ready for real evidence.',
      rationale: 'Connect Google or Microsoft 365, then sync. Chief will prepare judgment from authorized sources without crossing workspace boundaries or turning observations into approved truth.',
      outcomeIds: [],
      ignoredCount: 0,
    })),
    outcomes: [],
    sources: [],
    people: [],
    meetings: [],
    commitments: [],
    decisions: [],
    candidates: [],
    approvals: [],
    audit: workspaces.map((workspace) => ({
      id: `audit-personal-${workspace.id}`,
      workspaceId: workspace.id,
      timestamp: 'Just now',
      actor: ownerName,
      action: 'Activated personal workspace',
      detail: 'Fictional demo records were excluded. The workspace starts empty and accepts only owner-authorized sources.',
      riskTier: 'R0' as const,
      outcome: 'SUCCEEDED' as const,
    })),
    inbox: [],
    captures: [],
    editorialStandard,
  };
}

export function isLegacyDemoState(value: unknown): value is AppState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AppState>;
  return !candidate.mode || candidate.mode === 'SAMPLE';
}

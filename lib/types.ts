export type WorkspaceId = string;
export type TruthState = 'OBSERVED' | 'AI_CANDIDATE' | 'APPROVED' | 'SUPERSEDED' | 'REJECTED';
export type RiskTier = 'R0' | 'R1' | 'R2' | 'R3' | 'R4';
export type ConnectorProvider = 'GOOGLE' | 'MICROSOFT';

export interface OwnerProfile {
  name: string;
  email?: string;
  initials: string;
}

export interface ConnectionStatus {
  configured: boolean;
  status: 'NOT_CONNECTED' | 'CONNECTED' | 'REAUTH_REQUIRED';
  email?: string;
  workspaceId?: WorkspaceId;
  lastSyncedAt?: string;
  scopes: string[];
}

export type GoogleConnectionStatus = ConnectionStatus;
export type MicrosoftConnectionStatus = ConnectionStatus;

export interface RuntimeStatus {
  authenticated: boolean;
  modelConfigured: boolean;
  owner: OwnerProfile;
  google: Record<WorkspaceId, GoogleConnectionStatus>;
  microsoft: Record<WorkspaceId, MicrosoftConnectionStatus>;
}

export interface Workspace {
  id: WorkspaceId;
  name: string;
  type: string;
  classification: 'Confidential' | 'Private';
  defaultTimeZone: string;
}

export interface Citation {
  sourceId: string;
  excerpt: string;
}

export interface SourceItem {
  id: string;
  workspaceId: WorkspaceId;
  type: 'Email' | 'Calendar' | 'Meeting notes' | 'Decision' | 'Capture';
  title: string;
  author: string;
  timestamp: string;
  ingestedAt: string;
  excerpt: string;
  truthState: TruthState;
  connector: string;
  connectorProvider?: ConnectorProvider;
  freshness: string;
  suspicious?: boolean;
}

export interface Outcome {
  id: string;
  workspaceId: WorkspaceId;
  category: 'DECIDE' | 'DELEGATE' | 'DO' | 'INFORM' | 'IGNORE';
  title: string;
  whyNow: string;
  consequence: string;
  recommendation: string;
  sourceIds: string[];
  priority: number;
  connectorProvider?: ConnectorProvider;
}

export interface Brief {
  workspaceId: WorkspaceId;
  ruling: string;
  rationale: string;
  outcomeIds: string[];
  ignoredCount: number;
}

export interface Person {
  id: string;
  workspaceId: WorkspaceId;
  name: string;
  title: string;
  initials: string;
  lastInteraction: string;
  connectorProvider?: ConnectorProvider;
}

export interface MeetingPrep {
  purpose: string;
  desiredOutcome: string;
  decisionRequired: string;
  recommendedPosition: string;
  flexiblePoints: string[];
  priorCommitments: string[];
  questions: string[];
  risks: string[];
  sourceIds: string[];
}

export interface Meeting {
  id: string;
  workspaceId: WorkspaceId;
  title: string;
  dateLabel: string;
  start: string;
  end: string;
  participantIds: string[];
  readiness: 'READY' | 'PARTIAL' | 'NOT_STARTED';
  location: string;
  prep: MeetingPrep;
  connectorProvider?: ConnectorProvider;
}

export interface Commitment {
  id: string;
  workspaceId: WorkspaceId;
  statement: string;
  owner: string;
  promisee: string;
  dueDate: string;
  status: 'PROPOSED' | 'ACTIVE' | 'AT_RISK' | 'FULFILLED' | 'REJECTED';
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  sourceIds: string[];
  confidence: number;
  history: string[];
}

export interface Decision {
  id: string;
  workspaceId: WorkspaceId;
  title: string;
  ruling: string;
  rationale: string;
  status: 'PROPOSED' | 'ACTIVE' | 'SUPERSEDED' | 'REJECTED';
  date: string;
  reviewDate?: string;
  supersedes?: string;
  supersededBy?: string;
  sourceIds: string[];
}

export interface Candidate {
  id: string;
  workspaceId: WorkspaceId;
  type: 'COMMITMENT' | 'DECISION' | 'OPEN_QUESTION';
  statement: string;
  evidenceSpan: string;
  owner?: string;
  promisee?: string;
  dueDate?: string;
  confidence: number;
  ambiguity?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  sourceIds: string[];
}

export interface Approval {
  id: string;
  workspaceId: WorkspaceId;
  actionType: 'CREATE_GMAIL_DRAFT' | 'CREATE_CALENDAR_EVENT' | 'CREATE_OUTLOOK_DRAFT' | 'CREATE_OUTLOOK_EVENT';
  title: string;
  riskTier: 'R2';
  status: 'PENDING' | 'EXECUTED' | 'REJECTED' | 'EXPIRED';
  target: string;
  payload: { to?: string; subject?: string; body?: string; start?: string; end?: string };
  rationale: string;
  sourceIds: string[];
  reversible: boolean;
  expiresAt: string;
  idempotencyKey: string;
  executionResult?: string;
}

export interface AuditEvent {
  id: string;
  workspaceId: WorkspaceId;
  timestamp: string;
  actor: string;
  action: string;
  detail: string;
  riskTier: RiskTier;
  outcome: 'SUCCEEDED' | 'BLOCKED' | 'PENDING' | 'REJECTED';
}

export interface InboxThread {
  id: string;
  workspaceId: WorkspaceId;
  sender: string;
  subject: string;
  summary: string;
  exactAsk: string;
  classification: 'DECIDE' | 'REPLY' | 'INFORM' | 'IGNORE' | 'SENSITIVE';
  received: string;
  sourceId: string;
  suspicious?: boolean;
  connectorProvider?: ConnectorProvider;
}

export interface CaptureRecord {
  id: string;
  workspaceId: WorkspaceId;
  raw: string;
  proposedType: string;
  implication: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
}

export interface AppState {
  version: number;
  mode: 'PERSONAL' | 'SAMPLE';
  owner: OwnerProfile;
  workspaces: Workspace[];
  briefs: Brief[];
  outcomes: Outcome[];
  sources: SourceItem[];
  people: Person[];
  meetings: Meeting[];
  commitments: Commitment[];
  decisions: Decision[];
  candidates: Candidate[];
  approvals: Approval[];
  audit: AuditEvent[];
  inbox: InboxThread[];
  captures: CaptureRecord[];
  editorialStandard: string;
}

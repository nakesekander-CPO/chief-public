'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, Archive, CalendarDays, Check, CheckCircle2, ChevronDown,
  ChevronRight, ClipboardCheck, Clock3, Command, Database, FileText, Gavel, Inbox,
  LayoutList, ListChecks, Menu, MessageSquareText, Plus, Quote, RotateCcw, Search,
  Settings2, ShieldCheck, Sparkles, X,
} from 'lucide-react';
import type { AppState, Approval, AuditEvent, Candidate, Commitment, Decision, RuntimeStatus, SourceItem, WorkspaceId } from '@/lib/types';

type View = 'Today' | 'Inbox' | 'Meetings' | 'Commitments' | 'Decisions' | 'Capture' | 'Ask Chief' | 'Approvals' | 'Memory' | 'Audit' | 'Settings';
type AskAnswer = { ruling: string; detail: string; sourceIds: string[]; inference?: string };

const primaryNav: { label: View; icon: typeof LayoutList }[] = [
  { label: 'Today', icon: LayoutList }, { label: 'Inbox', icon: Inbox }, { label: 'Meetings', icon: CalendarDays },
  { label: 'Commitments', icon: ListChecks }, { label: 'Decisions', icon: Gavel }, { label: 'Capture', icon: Plus },
  { label: 'Ask Chief', icon: MessageSquareText }, { label: 'Approvals', icon: ShieldCheck },
];
const secondaryNav: { label: View; icon: typeof Database }[] = [
  { label: 'Memory', icon: Database }, { label: 'Audit', icon: Archive }, { label: 'Settings', icon: Settings2 },
];

function cx(...values: Array<string | false | null | undefined>) { return values.filter(Boolean).join(' '); }
function nowId(prefix: string) { return `${prefix}-${Date.now().toString(36)}`; }
function todayLabel() { return new Intl.DateTimeFormat('en-IE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Dublin' }).format(new Date()); }
const disconnected = { configured: false, status: 'NOT_CONNECTED' as const, scopes: [] as string[] };
function disconnectedWorkspaces(state: AppState) { return Object.fromEntries(state.workspaces.map((workspace) => [workspace.id, { ...disconnected }])); }

export default function ChiefApp({ initialState }: { initialState: AppState }) {
  const [state, setState] = useState(initialState);
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId>(initialState.workspaces[0]?.id ?? 'northstar');
  const [view, setView] = useState<View>('Today');
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [csrf, setCsrf] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<'loading' | 'saved' | 'saving' | 'offline' | 'conflict'>('loading');
  const [toast, setToast] = useState<string | null>(null);
  const serverVersion = useRef(initialState.version);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const pendingSaves = useRef(0);
  const [runtime, setRuntime] = useState<RuntimeStatus>({
    authenticated: false,
    modelConfigured: false,
    owner: initialState.owner,
    google: disconnectedWorkspaces(initialState),
    microsoft: disconnectedWorkspaces(initialState),
  });

  useEffect(() => {
    fetch('/api/state', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('state unavailable');
        return response.json() as Promise<{ state: AppState; csrfToken: string; runtime: RuntimeStatus }>;
      })
      .then(({ state: saved, csrfToken, runtime: liveRuntime }) => {
        const requested = new URLSearchParams(window.location.search).get('workspace');
        setState(saved);
        serverVersion.current = saved.version;
        setRuntime(liveRuntime);
        setActiveWorkspace(saved.workspaces.some((workspace) => workspace.id === requested) ? requested! : saved.workspaces[0]?.id ?? 'northstar');
        setCsrf(csrfToken);
        setSyncState('saved');
      })
      .catch(() => setSyncState('offline'));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (state.version > serverVersion.current) serverVersion.current = state.version;
  }, [state.version]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setCaptureOpen(true); }
      if (event.key === 'Escape') { setCaptureOpen(false); setSourceId(null); setMobileNavOpen(false); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  function persist(next: AppState) {
    if (!csrf) return;
    pendingSaves.current += 1;
    setSyncState('saving');
    saveQueue.current = saveQueue.current.then(async () => {
      try {
        const outgoing = { ...next, version: serverVersion.current };
        const response = await fetch('/api/state', { method: 'PUT', headers: { 'content-type': 'application/json', 'x-chief-csrf': csrf }, body: JSON.stringify(outgoing) });
        if (response.status === 409) { setSyncState('conflict'); return; }
        if (!response.ok) throw new Error('save failed');
        const body = await response.json() as { state: AppState };
        serverVersion.current = body.state.version;
        setState((current) => ({ ...current, version: body.state.version }));
      } catch { setSyncState('offline'); }
      finally {
        pendingSaves.current -= 1;
        if (pendingSaves.current === 0) setSyncState((current) => current === 'conflict' || current === 'offline' ? current : 'saved');
      }
    });
  }

  function mutate(update: (current: AppState) => AppState, message?: string) {
    setState((current) => {
      const next = update(current);
      void persist(next);
      return next;
    });
    if (message) setToast(message);
  }

  function navigate(next: View) {
    if (next === 'Capture') { setCaptureOpen(true); return; }
    setView(next); setMobileNavOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openSource(id: string) { setSourceId(id); }
  const workspace = state.workspaces.find((item) => item.id === activeWorkspace)!;
  const source = state.sources.find((item) => item.id === sourceId) ?? null;
  const pendingApprovals = state.approvals.filter((item) => item.workspaceId === activeWorkspace && item.status === 'PENDING').length;
  const google = runtime.google[activeWorkspace] ?? disconnected;
  const microsoft = runtime.microsoft[activeWorkspace] ?? disconnected;
  const connectorConnected = google.status === 'CONNECTED' || microsoft.status === 'CONNECTED';
  const liveEmails = [google, microsoft].filter((connection) => connection.status === 'CONNECTED').map((connection) => connection.email).filter(Boolean).join(' · ');

  function switchWorkspace(id: WorkspaceId) {
    setActiveWorkspace(id); setSourceId(null); setView('Today'); setMobileNavOpen(false);
    setToast(`Switched to ${state.workspaces.find((item) => item.id === id)?.name}. Retrieval scope changed.`);
  }

  return (
    <main className="chief-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className={cx('sidebar', mobileNavOpen && 'mobile-open')} aria-label="Chief navigation">
        <div className="sidebar-head"><button className="brand-button" onClick={() => navigate('Today')}><span>C</span><strong>Chief</strong></button><button className="mobile-close" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation"><X size={20}/></button></div>
        <nav className="primary-nav" aria-label="Primary">
          {primaryNav.map(({ label, icon: Icon }) => <button key={label} className={cx(view === label && 'active')} onClick={() => navigate(label)}><Icon size={16}/><span>{label}</span>{label === 'Approvals' && pendingApprovals > 0 && <b>{pendingApprovals}</b>}</button>)}
        </nav>
        <nav className="secondary-nav" aria-label="Secondary">
          {secondaryNav.map(({ label, icon: Icon }) => <button key={label} className={cx(view === label && 'active')} onClick={() => navigate(label)}><Icon size={16}/><span>{label}</span></button>)}
        </nav>
        <div className="workspace-switcher">
          <label htmlFor="workspace-select">Workspace</label>
          <div><span className={cx('workspace-mark', workspace.classification === 'Private' && 'private')} />
            <select id="workspace-select" value={activeWorkspace} onChange={(event) => switchWorkspace(event.target.value as WorkspaceId)}>
              {state.workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select><ChevronDown size={14}/>
          </div>
          <small>{workspace.classification} · Isolated</small>
        </div>
      </aside>

      <section className="app-column">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation"><Menu size={20}/></button>
          <div className="today-label"><p>{todayLabel()}</p><span>Europe/Dublin · {syncState === 'saving' ? 'Saving…' : syncState === 'saved' ? 'Saved' : syncState === 'conflict' ? 'Reload required' : syncState === 'offline' ? 'Connection unavailable' : 'Opening…'}</span></div>
          <div className="top-actions"><button className="quick-capture" onClick={() => setCaptureOpen(true)}><Plus size={16}/> Capture <kbd>⌘K</kbd></button><button className="avatar" aria-label="Account and privacy settings" onClick={() => navigate('Settings')}>{state.owner.initials}</button></div>
        </header>
        <div className={cx('demo-banner', connectorConnected && 'live')}><span>{connectorConnected ? 'Live workspace' : 'Isolated workspace'}</span><p>{connectorConnected ? `${liveEmails} · connections mapped only to ${workspace.name}` : 'Signed in · connect Google or Microsoft 365 to import real evidence'}</p><ShieldCheck size={14}/></div>
        <div id="main-content" className="main-content" tabIndex={-1}>
          {view === 'Today' && <TodayView state={state} workspaceId={activeWorkspace} openSource={openSource} navigate={navigate} connectorConnected={connectorConnected}/>}
          {view === 'Inbox' && <InboxView state={state} workspaceId={activeWorkspace} openSource={openSource} navigate={navigate} mutate={mutate}/>}
          {view === 'Meetings' && <MeetingsView state={state} workspaceId={activeWorkspace} openSource={openSource} mutate={mutate}/>} 
          {view === 'Commitments' && <CommitmentsView state={state} workspaceId={activeWorkspace} openSource={openSource} mutate={mutate}/>} 
          {view === 'Decisions' && <DecisionsView state={state} workspaceId={activeWorkspace} openSource={openSource} mutate={mutate}/>} 
          {view === 'Ask Chief' && <AskView state={state} workspaceId={activeWorkspace} openSource={openSource} runtime={runtime}/>}
          {view === 'Approvals' && <ApprovalsView state={state} workspaceId={activeWorkspace} openSource={openSource} mutate={mutate} csrf={csrf} setState={setState} setToast={setToast} googleConnected={google.status === 'CONNECTED'} microsoftConnected={microsoft.status === 'CONNECTED'}/>}
          {view === 'Memory' && <MemoryView state={state} workspaceId={activeWorkspace} openSource={openSource}/>} 
          {view === 'Audit' && <AuditView state={state} workspaceId={activeWorkspace}/>} 
          {view === 'Settings' && <SettingsView state={state} workspaceId={activeWorkspace} mutate={mutate} csrf={csrf} setState={setState} setToast={setToast} runtime={runtime} setRuntime={setRuntime} onWorkspaceCreated={switchWorkspace}/>}
        </div>
      </section>

      <button className="mobile-fab" onClick={() => setCaptureOpen(true)} aria-label="Quick capture"><Plus size={22}/></button>
      {source && <SourceDrawer source={source} close={() => setSourceId(null)}/>} 
      {captureOpen && <CaptureModal state={state} workspaceId={activeWorkspace} close={() => setCaptureOpen(false)} mutate={mutate}/>} 
      {mobileNavOpen && <button className="nav-scrim" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation overlay"/>}
      {toast && <div className="toast" role="status"><CheckCircle2 size={17}/>{toast}</div>}
    </main>
  );
}

function PageHead({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <header className="page-head"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{action}</header>;
}

function CitationChips({ ids, state, openSource }: { ids: string[]; state: AppState; openSource: (id: string) => void }) {
  return <div className="citation-row" aria-label="Sources">{ids.map((id, index) => { const source = state.sources.find((item) => item.id === id); return source ? <button key={id} onClick={() => openSource(id)}><Quote size={11}/>{index + 1} · {source.type}</button> : null; })}</div>;
}

function Status({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'danger' | 'accent' }) { return <span className={`status ${tone}`}>{children}</span>; }

function TodayView({ state, workspaceId, openSource, navigate, connectorConnected }: { state: AppState; workspaceId: WorkspaceId; openSource: (id: string) => void; navigate: (view: View) => void; connectorConnected: boolean }) {
  const brief = state.briefs.find((item) => item.workspaceId === workspaceId)!;
  const outcomes = brief.outcomeIds.map((id) => state.outcomes.find((item) => item.id === id)!).filter(Boolean);
  const meeting = state.meetings.find((item) => item.workspaceId === workspaceId);
  const risks = state.commitments.filter((item) => item.workspaceId === workspaceId && (item.status === 'AT_RISK' || item.risk === 'HIGH'));
  const pending = state.approvals.filter((item) => item.workspaceId === workspaceId && item.status === 'PENDING');
  return <>
    {!connectorConnected && state.sources.filter((item) => item.workspaceId === workspaceId).length === 0 && <section className="activation-card"><div><p className="eyebrow">Ready for your data</p><h2>Connect an account to this workspace</h2><p>Chief starts empty. It imports a bounded window of Gmail, Outlook, and calendar evidence only after you authorize this exact workspace.</p></div><button className="solid-button" onClick={() => navigate('Settings')}>Open connections <ChevronRight size={14}/></button></section>}
    <article className="ruling-block">
      <p className="eyebrow">Executive ruling</p><h1>{brief.ruling}</h1><p className="ruling-copy">{brief.rationale}</p>
      <CitationChips ids={[...new Set(outcomes.flatMap((item) => item.sourceIds))].slice(0,3)} state={state} openSource={openSource}/>
    </article>
    <div className="section-heading"><div><p className="eyebrow">Today</p><h2>Three outcomes</h2></div><span>Ordered by consequence, not noise</span></div>
    <section className="outcome-list" aria-label="Three outcomes">{outcomes.map((item, index) => <article className="outcome-row" key={item.id}><span className="outcome-number">0{index + 1}</span><div><div className="row-meta"><Status tone={item.category === 'DECIDE' ? 'accent' : 'neutral'}>{item.category}</Status><span>Priority {item.priority.toFixed(1)} / 5</span></div><h3>{item.title}</h3><p>{item.recommendation}</p><details><summary>Why this is here</summary><p>{item.whyNow} {item.consequence}</p></details><CitationChips ids={item.sourceIds} state={state} openSource={openSource}/></div><ChevronRight className="row-arrow" size={20}/></article>)}</section>
    {outcomes.length === 0 && <EmptyState title="No outcomes yet" copy={connectorConnected ? 'Sync this workspace to prepare today’s consequential outcomes.' : 'Connect Google or Microsoft 365 in Settings, then sync your authorized evidence.'}/>}
    <section className="dashboard-grid">
      {meeting && <article className="instrument"><div className="instrument-top"><p className="eyebrow">Next meeting · {meeting.start}</p><Status tone={meeting.readiness === 'READY' ? 'good' : 'warn'}>{meeting.readiness === 'READY' ? 'Ready' : 'Partial'}</Status></div><h2>{meeting.title}</h2><p>{meeting.prep.decisionRequired}</p><div className="instrument-note"><span className="ready-dot"/> Preparation uses {meeting.prep.sourceIds.length} current sources</div><button className="outline-button" onClick={() => navigate('Meetings')}>Open preparation <ChevronRight size={14}/></button></article>}
      <article className="instrument"><div className="instrument-top"><p className="eyebrow">Needs your judgment</p><Status tone={pending.length ? 'warn' : 'good'}>{pending.length} pending</Status></div><h2>{pending.length} approval{pending.length === 1 ? '' : 's'}</h2><p>{pending[0]?.title ?? 'Nothing is waiting for approval.'}</p><div className="instrument-note">Reversible writes only · Email sending is unavailable</div><button className="outline-button" onClick={() => navigate('Approvals')}>Review exact changes <ChevronRight size={14}/></button></article>
      <article className="instrument compact"><div className="instrument-top"><p className="eyebrow">Commitment risk</p><span>{risks.length}</span></div><h3>{risks[0]?.statement ?? 'No commitments at risk'}</h3><p>{risks[0] ? `${risks[0].owner} · ${risks[0].dueDate}` : 'All approved promises are on track.'}</p><button className="text-button" onClick={() => navigate('Commitments')}>Open ledger</button></article>
      <article className="instrument compact"><div className="instrument-top"><p className="eyebrow">Intentionally ignored</p><span>{brief.ignoredCount}</span></div><h3>Low-consequence updates suppressed</h3><p>Newsletters, automated notices, and threads with no direct ask.</p><button className="text-button" onClick={() => navigate('Inbox')}>Inspect the rule</button></article>
    </section>
  </>;
}

function InboxView({ state, workspaceId, openSource, navigate, mutate }: { state: AppState; workspaceId: WorkspaceId; openSource: (id: string) => void; navigate: (view: View) => void; mutate: (update: (current: AppState) => AppState, message?: string) => void }) {
  const threads = state.inbox.filter((item) => item.workspaceId === workspaceId);
  function prepareReply(thread: AppState['inbox'][number]) {
    const email = thread.sender.match(/<([^>]+@[^>]+)>/)?.[1] ?? thread.sender.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0];
    if (!email) { openSource(thread.sourceId); return; }
    const idempotencyKey = `reply-${thread.id}`;
    const isMicrosoft = thread.connectorProvider === 'MICROSOFT';
    mutate((current) => {
      if (current.approvals.some((item) => item.idempotencyKey === idempotencyKey)) return current;
      const approval: Approval = { id: nowId('approval'), workspaceId, actionType: isMicrosoft ? 'CREATE_OUTLOOK_DRAFT' : 'CREATE_GMAIL_DRAFT', title: `Create reply draft for “${thread.subject}”`, riskTier: 'R2', status: 'PENDING', target: `${isMicrosoft ? 'Outlook' : 'Gmail'} draft to ${email}`, payload: { to: email, subject: thread.subject.toLowerCase().startsWith('re:') ? thread.subject : `Re: ${thread.subject}`, body: `Thanks — I’ve received this. I’ll review it and come back to you shortly.` }, rationale: 'Prepare a reversible draft for owner review. Chief cannot send it.', sourceIds: [thread.sourceId], reversible: true, expiresAt: 'In 24 hours', idempotencyKey };
      return { ...current, approvals: [approval, ...current.approvals], audit: [{ id: nowId('audit'), workspaceId, timestamp: 'Just now', actor: 'Chief', action: `Proposed ${isMicrosoft ? 'Outlook' : 'Gmail'} draft`, detail: `Prepared an exact reply payload for ${email}. No email was sent.`, riskTier: 'R2', outcome: 'PENDING' }, ...current.audit] };
    }, `Reply draft proposed. Review the exact wording before creating it in ${isMicrosoft ? 'Outlook' : 'Gmail'}.`);
    navigate('Approvals');
  }
  return <><PageHead eyebrow="Thread-level triage" title="Inbox" description="The ask and consequence, without rereading the thread."/>
    <div className="inbox-toolbar"><span>{threads.length} reviewed threads</span><span>Bounded to the latest authorized sync</span></div>
    <section className="inbox-list">{threads.map((thread) => <article className={cx('inbox-item', thread.suspicious && 'suspicious')} key={thread.id}><div className="sender-avatar">{thread.sender.split(' ').map((p) => p[0]).join('').slice(0,2)}</div><div><div className="inbox-title"><h2>{thread.subject}</h2><span>{thread.received}</span></div><p className="sender">{thread.sender}</p><p>{thread.summary}</p><div className="exact-ask"><strong>Exact ask</strong><span>{thread.exactAsk}</span></div><div className="card-actions"><Status tone={thread.classification === 'SENSITIVE' ? 'danger' : thread.classification === 'DECIDE' ? 'accent' : 'neutral'}>{thread.classification}</Status><button className="text-button" onClick={() => openSource(thread.sourceId)}>Open source</button>{thread.classification === 'REPLY' && <button className="text-button" onClick={() => prepareReply(thread)}>Prepare reply draft</button>}</div></div></article>)}</section>
    {threads.length === 0 && <EmptyState title="No synced email" copy="Connect and sync Google or Microsoft 365 from Settings to triage your latest threads."/>}
  </>;
}

function MeetingsView({ state, workspaceId, openSource, mutate }: { state: AppState; workspaceId: WorkspaceId; openSource: (id: string) => void; mutate: (update: (current: AppState) => AppState, message?: string) => void }) {
  const meetings = state.meetings.filter((item) => item.workspaceId === workspaceId);
  const [selectedId, setSelectedId] = useState(meetings[0]?.id ?? '');
  const [debriefOpen, setDebriefOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [extractNotice, setExtractNotice] = useState<string | null>(null);
  const meeting = meetings.find((item) => item.id === selectedId) ?? meetings[0];
  const pendingCandidates = state.candidates.filter((item) => item.workspaceId === workspaceId && item.status === 'PENDING');
  function extract() {
    const lines = notes.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    const sourceId = nowId('source-notes');
    const candidates = lines.flatMap<Candidate>((line, index) => {
      const speakerMatch = line.match(/^([^:]{1,80}):\s*(.+)$/);
      const speaker = speakerMatch?.[1]?.trim();
      const statement = (speakerMatch?.[2] ?? line).trim();
      const base = { id: `${nowId('candidate')}-${index}`, workspaceId, statement, evidenceSpan: `“${line}”`, status: 'PENDING' as const, sourceIds: [sourceId] };
      if (/\b(maybe|might|probably|should consider|could consider|open question)\b/i.test(statement)) return [{ ...base, type: 'OPEN_QUESTION' as const, confidence: .58, ambiguity: 'Tentative language; Chief will not treat this as a commitment.' }];
      if (/\b(we decided|decision is|agreed that|resolved that|we will keep|we will not)\b/i.test(statement)) return [{ ...base, type: 'DECISION' as const, owner: speaker ?? state.owner.name, confidence: .9 }];
      if (/\b(i will|i’ll|i'll|i can|we will|we’ll|we'll|commit to|promise to)\b/i.test(statement)) {
        const due = statement.match(/\b(?:by|before|on)\s+([^,.]+(?:,\s*\d{1,2}\s+\w+)?)/i)?.[1];
        return [{ ...base, type: 'COMMITMENT' as const, owner: speaker ?? state.owner.name, promisee: meeting?.title ?? 'Unspecified', dueDate: due, confidence: due ? .94 : .82 }];
      }
      return [];
    });
    if (!candidates.length) { setExtractNotice('No firm commitment, decision, or open-question language was found.'); return; }
    setExtractNotice(null);
    const source: SourceItem = { id: sourceId, workspaceId, type: 'Meeting notes', title: `${meeting?.title ?? 'Meeting'} debrief`, author: state.owner.name, timestamp: new Date().toLocaleString('en-IE'), ingestedAt: new Date().toLocaleString('en-IE'), excerpt: notes.slice(0, 1_500), truthState: 'OBSERVED', connector: 'Manual debrief · Live', freshness: 'Captured just now' };
    const counts = candidates.reduce((acc, candidate) => ({ ...acc, [candidate.type]: (acc[candidate.type] ?? 0) + 1 }), {} as Record<string, number>);
    mutate((current) => ({ ...current, sources: [source, ...current.sources], candidates: [...current.candidates.filter((item) => !(item.workspaceId === workspaceId && item.status === 'PENDING')), ...candidates], audit: [{ id: nowId('audit'), workspaceId, timestamp: 'Just now', actor: 'Chief', action: 'Extracted meeting candidates', detail: `Created ${counts.COMMITMENT ?? 0} commitment, ${counts.DECISION ?? 0} decision, and ${counts.OPEN_QUESTION ?? 0} open-question candidates. Nothing became canonical.`, riskTier: 'R1', outcome: 'PENDING' }, ...current.audit] }), 'Candidates extracted from your notes. Nothing was approved automatically.');
  }
  function decideCandidate(candidate: Candidate, approved: boolean) {
    mutate((current) => {
      const updated = current.candidates.map((item) => item.id === candidate.id ? { ...item, status: approved ? 'APPROVED' as const : 'REJECTED' as const } : item);
      const audit: AuditEvent = { id: nowId('audit'), workspaceId, timestamp: 'Just now', actor: state.owner.name, action: approved ? `Approved ${candidate.type.toLowerCase()} candidate` : `Rejected ${candidate.type.toLowerCase()} candidate`, detail: candidate.statement, riskTier: 'R1', outcome: approved ? 'SUCCEEDED' : 'REJECTED' };
      if (!approved) return { ...current, candidates: updated, audit: [audit, ...current.audit] };
      if (candidate.type === 'COMMITMENT') {
        const commitment: Commitment = { id: nowId('commitment'), workspaceId, statement: candidate.statement, owner: candidate.owner ?? 'Unassigned', promisee: candidate.promisee ?? 'Unspecified', dueDate: candidate.dueDate ?? 'No date', status: 'ACTIVE', risk: 'MEDIUM', sourceIds: candidate.sourceIds, confidence: candidate.confidence, history: ['Approved from meeting debrief · Just now'] };
        return { ...current, candidates: updated, commitments: [commitment, ...current.commitments], audit: [audit, ...current.audit] };
      }
      if (candidate.type === 'DECISION') {
        const decision: Decision = { id: nowId('decision'), workspaceId, title: candidate.statement.slice(0, 72), ruling: candidate.statement, rationale: 'Approved explicitly from the meeting debrief evidence shown above.', status: 'ACTIVE', date: new Date().toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' }), sourceIds: candidate.sourceIds };
        return { ...current, candidates: updated, decisions: [decision, ...current.decisions], audit: [audit, ...current.audit] };
      }
      return { ...current, candidates: updated, audit: [audit, ...current.audit] };
    }, approved ? 'Approved and added to the canonical ledger.' : 'Candidate rejected and excluded from approved memory.');
  }
  if (!meeting) return <EmptyState title="No meetings in this workspace" copy="Connected calendar events will appear here."/>;
  return <><PageHead eyebrow="Meeting intelligence" title="Meetings" description="Arrive knowing the decision, the evidence, and the open loops." action={<button className="solid-button" onClick={() => setDebriefOpen(true)}><FileText size={15}/> Debrief notes</button>}/>
    <div className="meeting-layout"><aside className="meeting-list">{meetings.map((item) => <button className={cx(item.id === meeting.id && 'selected')} key={item.id} onClick={() => setSelectedId(item.id)}><span>{item.dateLabel} · {item.start}</span><strong>{item.title}</strong><small>{item.location}</small><Status tone={item.readiness === 'READY' ? 'good' : 'warn'}>{item.readiness}</Status></button>)}</aside>
      <article className="meeting-prep"><div className="prep-title"><div><p className="eyebrow">Preparation packet</p><h2>{meeting.title}</h2><p>{meeting.start}–{meeting.end} · {meeting.location}</p></div><Status tone="good">Evidence current</Status></div>
        <section className="decision-callout"><span>Decision required</span><h3>{meeting.prep.decisionRequired}</h3><p><strong>Recommended position:</strong> {meeting.prep.recommendedPosition}</p></section>
        <div className="prep-grid"><section><h3>Purpose</h3><p>{meeting.prep.purpose}</p></section><section><h3>Desired outcome</h3><p>{meeting.prep.desiredOutcome}</p></section></div>
        <section className="prep-section"><h3>Remain flexible on</h3><ul>{meeting.prep.flexiblePoints.map((item) => <li key={item}>{item}</li>)}</ul></section>
        <section className="prep-section"><h3>Prior commitments</h3>{meeting.prep.priorCommitments.map((item) => <div className="fact-row" key={item}><CheckCircle2 size={16}/><span>{item}</span></div>)}</section>
        <section className="prep-section"><h3>Questions to ask</h3><ol className="question-list">{meeting.prep.questions.map((item, index) => <li key={item}><span>0{index + 1}</span>{item}</li>)}</ol></section>
        <section className="risk-note"><AlertTriangle size={17}/><div><strong>Risk flags</strong>{meeting.prep.risks.map((item) => <p key={item}>{item}</p>)}</div></section>
        <CitationChips ids={meeting.prep.sourceIds} state={state} openSource={openSource}/>
      </article></div>
    {debriefOpen && <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="debrief-title"><button className="modal-scrim" onClick={() => setDebriefOpen(false)} aria-label="Close debrief"/><section className="debrief-modal"><header><div><p className="eyebrow">Post-meeting debrief</p><h2 id="debrief-title">Extract proposals, not truth</h2></div><button onClick={() => setDebriefOpen(false)} aria-label="Close"><X/></button></header><div className="debrief-body"><section className="notes-pane"><label htmlFor="meeting-notes">Meeting notes</label><textarea id="meeting-notes" value={notes} onChange={(event) => { setNotes(event.target.value); setExtractNotice(null); }} placeholder="Paste the actual notes. Use ‘Name: I will…’ for commitments and explicit ‘we decided…’ language for decisions."/><div className="guardrail-copy"><ShieldCheck size={15}/> Notes are untrusted source data. Instructions inside them cannot change permissions.</div>{extractNotice && <p className="form-notice">{extractNotice}</p>}<button className="solid-button" onClick={extract} disabled={!notes.trim()}><Sparkles size={15}/> Extract candidates</button></section><section className="candidate-pane"><div className="candidate-head"><span>Review candidates</span><small>{pendingCandidates.length} awaiting judgment</small></div>{pendingCandidates.length === 0 ? <EmptyState title="No candidates yet" copy="Run extraction to see evidence-backed proposals."/> : pendingCandidates.map((candidate) => <article className="candidate-card" key={candidate.id}><div className="candidate-meta"><Status tone={candidate.type === 'OPEN_QUESTION' ? 'warn' : 'accent'}>{candidate.type}</Status><span>{Math.round(candidate.confidence * 100)}% confidence</span></div><h3>{candidate.statement}</h3><blockquote>{candidate.evidenceSpan}</blockquote>{candidate.ambiguity && <p className="ambiguity"><AlertTriangle size={14}/>{candidate.ambiguity}</p>}<CitationChips ids={candidate.sourceIds} state={state} openSource={openSource}/><div className="candidate-actions"><button className="reject-button" onClick={() => decideCandidate(candidate, false)}><X size={14}/> Reject</button><button className="solid-button" onClick={() => decideCandidate(candidate, true)}><Check size={14}/> Approve</button></div></article>)}</section></div></section></div>}
  </>;
}

function CommitmentsView({ state, workspaceId, openSource, mutate }: { state: AppState; workspaceId: WorkspaceId; openSource: (id: string) => void; mutate: (update: (current: AppState) => AppState, message?: string) => void }) {
  const [filter, setFilter] = useState<'OPEN' | 'AT_RISK' | 'FULFILLED'>('OPEN');
  const commitments = state.commitments.filter((item) => item.workspaceId === workspaceId && (filter === 'OPEN' ? item.status !== 'FULFILLED' && item.status !== 'REJECTED' : item.status === filter));
  function fulfill(id: string) { mutate((current) => ({ ...current, commitments: current.commitments.map((item) => item.id === id ? { ...item, status: 'FULFILLED' as const, history: [...item.history, `Marked fulfilled by ${state.owner.name} · Just now`] } : item), audit: [{ id: nowId('audit'), workspaceId, timestamp: 'Just now', actor: state.owner.name, action: 'Marked commitment fulfilled', detail: id, riskTier: 'R1', outcome: 'SUCCEEDED' }, ...current.audit] }), 'Commitment marked fulfilled with history preserved.'); }
  return <><PageHead eyebrow="Canonical ledger" title="Commitments" description="Promises with owners, evidence, dates, and consequences."/>
    <div className="segmented" role="tablist">{(['OPEN','AT_RISK','FULFILLED'] as const).map((item) => <button role="tab" aria-selected={filter === item} className={cx(filter === item && 'active')} onClick={() => setFilter(item)} key={item}>{item.replace('_',' ')}</button>)}</div>
    <section className="ledger-list">{commitments.map((item) => <article className="ledger-card" key={item.id}><div className="ledger-top"><div><Status tone={item.status === 'AT_RISK' ? 'danger' : item.status === 'FULFILLED' ? 'good' : 'neutral'}>{item.status.replace('_',' ')}</Status><span>{item.risk} risk</span></div><button className="icon-button" aria-label="Open commitment"><ChevronRight size={17}/></button></div><h2>{item.statement}</h2><div className="ledger-facts"><div><span>Owner</span><strong>{item.owner}</strong></div><div><span>Promisee</span><strong>{item.promisee}</strong></div><div><span>Due</span><strong>{item.dueDate}</strong></div></div><CitationChips ids={item.sourceIds} state={state} openSource={openSource}/><details className="history"><summary>History · {item.history.length} events</summary>{item.history.map((entry) => <p key={entry}>{entry}</p>)}</details>{item.status !== 'FULFILLED' && <button className="outline-button" onClick={() => fulfill(item.id)}><Check size={14}/> Mark fulfilled</button>}</article>)}</section>
    {commitments.length === 0 && <EmptyState title={`No ${filter.toLowerCase().replace('_',' ')} commitments`} copy="The ledger is clear for this filter."/>}
  </>;
}

function DecisionsView({ state, workspaceId, openSource, mutate }: { state: AppState; workspaceId: WorkspaceId; openSource: (id: string) => void; mutate: (update: (current: AppState) => AppState, message?: string) => void }) {
  const [draft, setDraft] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const decisions = state.decisions.filter((item) => item.workspaceId === workspaceId);
  const active = decisions.find((item) => item.status === 'ACTIVE');
  function supersede(old: Decision) {
    const replacement: Decision = { id: nowId('decision'), workspaceId, title: `${old.title} · revised`, ruling: draft.trim() || old.ruling, rationale: 'Explicitly approved as a revised ruling. The prior decision remains in history.', status: 'ACTIVE', date: new Date().toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' }), supersedes: old.id, sourceIds: old.sourceIds };
    mutate((current) => ({ ...current, decisions: [replacement, ...current.decisions.map((item) => item.id === old.id ? { ...item, status: 'SUPERSEDED' as const, supersededBy: replacement.id } : item)], audit: [{ id: nowId('audit'), workspaceId, timestamp: 'Just now', actor: state.owner.name, action: 'Superseded decision', detail: `${old.id} → ${replacement.id}. Prior version retained.`, riskTier: 'R3', outcome: 'SUCCEEDED' }, ...current.audit] }), 'New decision version is active. The prior ruling remains in history.');
  }
  return <><PageHead eyebrow="Versioned truth" title="Decisions" description="The active ruling, why it was made, and what it replaced."/>
    <section className="decision-list">{decisions.map((item) => <article className={cx('decision-card', item.status === 'SUPERSEDED' && 'muted-card')} key={item.id}><div className="decision-card-head"><div><Status tone={item.status === 'ACTIVE' ? 'good' : 'neutral'}>{item.status}</Status><span>{item.date}</span></div>{item.reviewDate && <span>Review {item.reviewDate}</span>}</div><h2>{item.title}</h2><blockquote>{item.ruling}</blockquote><p>{item.rationale}</p>{item.supersededBy && <div className="superseded-note">Current ruling: {decisions.find((d) => d.id === item.supersededBy)?.title ?? item.supersededBy}</div>}<CitationChips ids={item.sourceIds} state={state} openSource={openSource}/>{item.status === 'ACTIVE' && <button className="outline-button" onClick={() => supersede(item)}>Create revised version</button>}</article>)}</section>
    {workspaceId === 'northstar' && <section className="contradiction-panel"><div className="section-heading"><div><p className="eyebrow">Contradiction & drift</p><h2>Review a new proposal</h2></div><span>Advisory comparison only</span></div><textarea aria-label="Draft to review" placeholder="Paste a real proposal to compare with the active approved ruling…" value={draft} onChange={(event) => { setDraft(event.target.value); setReviewed(false); }}/><button className="solid-button" disabled={!draft.trim() || !active} onClick={() => setReviewed(true)}><Search size={15}/> Compare with approved records</button>{reviewed && active && <article className="finding"><div><Status tone="warn">Judgment required</Status><span>Lexical comparison</span></div><h3>Review whether the proposal changes, narrows, or contradicts the active ruling.</h3><div className="compare"><section><span>New proposal</span><blockquote>“{draft}”</blockquote></section><section><span>Approved record</span><blockquote>“{active.ruling}”</blockquote></section></div><p><strong>Consequence:</strong> Approving the proposal without versioning may leave two incompatible instructions active.</p><p><strong>Recommended resolution:</strong> Keep it as a scenario, or use the revised-version action to supersede the current ruling explicitly.</p><CitationChips ids={active.sourceIds} state={state} openSource={openSource}/></article>}</section>}
  </>;
}

function AskView({ state, workspaceId, openSource, runtime }: { state: AppState; workspaceId: WorkspaceId; openSource: (id: string) => void; runtime: RuntimeStatus }) {
  const [query, setQuery] = useState('What changed, what did we decide, and what do I owe next?');
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const workspace = state.workspaces.find((item) => item.id === workspaceId)!;
  async function ask() {
    setError(null);
    if (!runtime.modelConfigured) {
      setError('Live AI is not configured yet. Your approved ledgers remain available without it.');
      return;
    }
    setAsking(true);
    try {
      const response = await fetch('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspaceId, question: query }) });
      const body = await response.json() as { answer?: { ruling: string; facts: Array<{ claim: string; sourceIds: string[] }>; inferences: string[]; assumptions: string[]; recommendedAction: string | null }; detail?: string };
      if (!response.ok || !body.answer) throw new Error(body.detail ?? 'Chief could not answer safely.');
      setAnswer({
        ruling: body.answer.ruling,
        detail: body.answer.facts.map((fact) => fact.claim).join(' ') || 'No supported fact was available.',
        sourceIds: [...new Set(body.answer.facts.flatMap((fact) => fact.sourceIds))],
        inference: [body.answer.inferences.join(' '), body.answer.recommendedAction].filter(Boolean).join(' '),
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Chief could not answer safely.');
    } finally {
      setAsking(false);
    }
  }
  return <><PageHead eyebrow="Workspace-scoped answers" title="Ask Chief" description="Ask approved memory and authorized source material. Every factual answer shows its evidence."/>
    <section className="ask-surface"><div className="ask-scope"><ShieldCheck size={15}/><span>Searching only {workspace.name}</span><small>{runtime.modelConfigured ? 'Live OpenAI synthesis' : 'AI setup incomplete'} · Cross-workspace access off</small></div><div className="ask-input"><textarea value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Ask Chief a question"/><button className="solid-button" onClick={ask} disabled={asking || !query.trim()}><Sparkles size={15}/>{asking ? 'Thinking…' : 'Ask'}</button></div>
      {error && <div className="unsupported">{error}</div>}
      {!answer ? <div className="question-suggestions"><span>Try asking</span>{['What changed since the last sync?', 'Which commitments are at risk?', 'Find evidence for the current decision.'].map((item) => <button key={item} onClick={() => setQuery(item)}>{item}</button>)}</div> : <article className="answer-card"><p className="eyebrow">The ruling</p><h2>{answer.ruling}</h2><p>{answer.detail}</p>{answer.inference && <div className="inference"><span>Inference</span>{answer.inference}</div>}{answer.sourceIds.length ? <CitationChips ids={[...new Set(answer.sourceIds)]} state={state} openSource={openSource}/> : <div className="unsupported">Unsupported assumption avoided · no citation available</div>}<details><summary>Show context used</summary><p>{answer.sourceIds.length} authorized records from {workspace.name}. Candidates and superseded records were excluded from the answer.</p></details></article>}
    </section>
  </>;
}

function ApprovalsView({ state, workspaceId, openSource, mutate, csrf, setState, setToast, googleConnected, microsoftConnected }: { state: AppState; workspaceId: WorkspaceId; openSource: (id: string) => void; mutate: (update: (current: AppState) => AppState, message?: string) => void; csrf: string | null; setState: React.Dispatch<React.SetStateAction<AppState>>; setToast: (value: string | null) => void; googleConnected: boolean; microsoftConnected: boolean }) {
  const [filter, setFilter] = useState<'PENDING' | 'EXECUTED' | 'REJECTED'>('PENDING');
  const [executingId, setExecutingId] = useState<string | null>(null);
  const approvals = state.approvals.filter((item) => item.workspaceId === workspaceId && item.status === filter);
  const usesMicrosoft = (approval: Approval) => approval.actionType === 'CREATE_OUTLOOK_DRAFT' || approval.actionType === 'CREATE_OUTLOOK_EVENT';
  const connectionReady = (approval: Approval) => usesMicrosoft(approval) ? microsoftConnected : googleConnected;
  async function decide(approval: Approval, approved: boolean) {
    if (approved) {
      if (!csrf || !connectionReady(approval)) { setToast(`Connect ${usesMicrosoft(approval) ? 'Microsoft 365' : 'Google'} for this workspace before executing an approved write.`); return; }
      setExecutingId(approval.id);
      try {
        const response = await fetch('/api/approvals/execute', { method: 'POST', headers: { 'content-type': 'application/json', 'x-chief-csrf': csrf }, body: JSON.stringify({ approvalId: approval.id, workspaceId }) });
        const body = await response.json() as { state?: AppState; detail?: string };
        if (!response.ok || !body.state) throw new Error(body.detail ?? 'The action failed safely.');
        setState(body.state);
        const draftProvider = approval.actionType === 'CREATE_OUTLOOK_DRAFT' ? 'Outlook' : 'Gmail';
        setToast(approval.actionType === 'CREATE_GMAIL_DRAFT' || approval.actionType === 'CREATE_OUTLOOK_DRAFT' ? `Real ${draftProvider} draft created. No email was sent.` : 'Real private calendar event created. No invitations were sent.');
      } catch (caught) { setToast(caught instanceof Error ? caught.message : 'The action failed safely.'); }
      finally { setExecutingId(null); }
      return;
    }
    mutate((current) => {
      const audit: AuditEvent = { id: nowId('audit'), workspaceId, timestamp: 'Just now', actor: state.owner.name, action: 'Rejected proposed action', detail: approval.title, riskTier: 'R2', outcome: 'REJECTED' };
      return { ...current, approvals: current.approvals.map((item) => item.id === approval.id ? { ...item, status: 'REJECTED' as const } : item), audit: [audit, ...current.audit] };
    }, 'Proposed action rejected.');
  }
  return <><PageHead eyebrow="Read broadly. Write narrowly." title="Approvals" description="Inspect the exact payload before any reversible external write."/>
    <div className="segmented" role="tablist">{(['PENDING','EXECUTED','REJECTED'] as const).map((item) => <button role="tab" aria-selected={filter === item} className={cx(filter === item && 'active')} onClick={() => setFilter(item)} key={item}>{item}</button>)}</div>
    <section className="approval-list">{approvals.map((item) => { const draft = item.actionType === 'CREATE_GMAIL_DRAFT' || item.actionType === 'CREATE_OUTLOOK_DRAFT'; const provider = usesMicrosoft(item) ? 'Outlook' : 'Google'; return <article className="approval-card" key={item.id}><header><div><Status tone={item.status === 'PENDING' ? 'warn' : item.status === 'EXECUTED' ? 'good' : 'danger'}>{item.status}</Status><Status tone="accent">{item.riskTier}</Status></div><span>Expires {item.expiresAt}</span></header><h2>{item.title}</h2><p>{item.rationale}</p><div className="approval-facts"><div><span>What will happen</span><strong>{draft ? `Create an ${provider === 'Outlook' ? 'Outlook' : 'Gmail'} draft. It will not be sent.` : `Create a private ${provider} calendar event. No attendees invited.`}</strong></div><div><span>Exact target</span><strong>{item.target}</strong></div><div><span>Reversibility</span><strong>{item.reversible ? 'Reversible' : 'Irreversible'}</strong></div></div><section className="payload-preview"><div><span>Exact payload</span><small>Locked for this approval</small></div>{item.payload.to && <p><b>To</b>{item.payload.to}</p>}{item.payload.subject && <p><b>Subject</b>{item.payload.subject}</p>}{item.payload.start && <p><b>When</b>{item.payload.start} – {item.payload.end}</p>}<div className="payload-body">{item.payload.body}</div></section><CitationChips ids={item.sourceIds} state={state} openSource={openSource}/>{item.executionResult && <div className="execution-result"><CheckCircle2 size={16}/>{item.executionResult}</div>}{item.status === 'PENDING' && <div className="approval-actions"><button className="reject-button" onClick={() => void decide(item, false)}><X size={14}/> Reject</button><button className="solid-button" disabled={!connectionReady(item) || executingId === item.id} onClick={() => void decide(item, true)}><Check size={14}/>{executingId === item.id ? 'Creating…' : draft ? 'Create real draft' : 'Create real private event'}</button></div>}</article>; })}</section>
    {approvals.length === 0 && <EmptyState title={`No ${filter.toLowerCase()} approvals`} copy={filter === 'PENDING' ? 'Nothing is waiting for your judgment.' : 'No actions match this filter.'}/>} 
  </>;
}

function MemoryView({ state, workspaceId, openSource }: { state: AppState; workspaceId: WorkspaceId; openSource: (id: string) => void }) {
  const sources = state.sources.filter((item) => item.workspaceId === workspaceId);
  const approved = state.decisions.filter((item) => item.workspaceId === workspaceId && item.status === 'ACTIVE').length + state.commitments.filter((item) => item.workspaceId === workspaceId && item.status !== 'PROPOSED' && item.status !== 'REJECTED').length;
  return <><PageHead eyebrow="Governed memory" title="Memory" description="Observed sources are evidence. Only approved records are organizational truth."/>
    <section className="truth-tiers"><article><span>01</span><h3>Observed source</h3><p>{sources.length} authorized records</p></article><article><span>02</span><h3>AI candidate</h3><p>{state.candidates.filter((item) => item.workspaceId === workspaceId && item.status === 'PENDING').length} awaiting review</p></article><article><span>03</span><h3>Approved canon</h3><p>{approved} current records</p></article></section>
    <div className="source-table"><div className="table-head"><span>Source</span><span>State</span><span>Freshness</span><span/></div>{sources.map((source) => <button key={source.id} onClick={() => openSource(source.id)}><span><b>{source.title}</b><small>{source.type} · {source.author}</small></span><Status tone={source.truthState === 'APPROVED' ? 'good' : source.truthState === 'SUPERSEDED' ? 'neutral' : source.suspicious ? 'danger' : 'accent'}>{source.truthState.replace('_',' ')}</Status><span>{source.freshness}</span><ChevronRight size={16}/></button>)}</div>
  </>;
}

function AuditView({ state, workspaceId }: { state: AppState; workspaceId: WorkspaceId }) {
  const events = state.audit.filter((item) => item.workspaceId === workspaceId);
  return <><PageHead eyebrow="Append-only history" title="Audit" description="Every proposal, approval, guardrail, and side effect—plainly recorded."/>
    <section className="audit-list">{events.map((item) => <article key={item.id}><div className={cx('audit-icon', item.outcome.toLowerCase())}>{item.outcome === 'BLOCKED' ? <ShieldCheck size={16}/> : item.outcome === 'SUCCEEDED' ? <Check size={16}/> : <Clock3 size={16}/>}</div><div><div className="audit-title"><h2>{item.action}</h2><span>{item.timestamp}</span></div><p>{item.detail}</p><div className="audit-meta"><Status tone={item.riskTier === 'R4' ? 'danger' : item.riskTier === 'R2' ? 'warn' : 'neutral'}>{item.riskTier}</Status><span>{item.actor}</span><span>{item.outcome}</span></div></div></article>)}</section>
  </>;
}

function SettingsView({ state, workspaceId, mutate, csrf, setState, setToast, runtime, setRuntime, onWorkspaceCreated }: { state: AppState; workspaceId: WorkspaceId; mutate: (update: (current: AppState) => AppState, message?: string) => void; csrf: string | null; setState: React.Dispatch<React.SetStateAction<AppState>>; setToast: (value: string | null) => void; runtime: RuntimeStatus; setRuntime: React.Dispatch<React.SetStateAction<RuntimeStatus>>; onWorkspaceCreated: (id: WorkspaceId) => void }) {
  const [standard, setStandard] = useState(state.editorialStandard);
  const [working, setWorking] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState('');
  const [classification, setClassification] = useState<'Confidential' | 'Private'>('Confidential');
  const workspace = state.workspaces.find((item) => item.id === workspaceId)!;
  const google = runtime.google[workspaceId] ?? disconnected;
  const microsoft = runtime.microsoft[workspaceId] ?? disconnected;

  async function sync(provider: 'google' | 'microsoft') {
    if (!csrf) return;
    setWorking(`${provider}-sync`);
    try {
      const response = await fetch(`/api/connections/${provider}/sync`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-chief-csrf': csrf }, body: JSON.stringify({ workspaceId }) });
      const body = await response.json() as { state?: AppState; connection?: RuntimeStatus['google'][WorkspaceId]; imported?: number; detail?: string };
      if (!response.ok || !body.state || !body.connection) throw new Error(body.detail ?? 'Sync failed safely.');
      setState(body.state);
      setRuntime((current) => ({ ...current, [provider]: { ...current[provider], [workspaceId]: body.connection! } }));
      setToast(`Synced ${body.imported ?? 0} real ${provider === 'google' ? 'Google' : 'Microsoft 365'} records into ${workspace.name}.`);
    } catch (caught) { setToast(caught instanceof Error ? caught.message : 'Sync failed safely.'); }
    finally { setWorking(null); }
  }

  async function disconnect(provider: 'google' | 'microsoft') {
    const connection = provider === 'google' ? google : microsoft;
    const label = provider === 'google' ? 'Google' : 'Microsoft 365';
    if (!csrf || !window.confirm(`Disconnect ${connection.email ?? label} from ${workspace.name}? Existing imported evidence stays until you clear it.`)) return;
    setWorking(`${provider}-disconnect`);
    try {
      const response = await fetch(`/api/connections/${provider}/disconnect`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-chief-csrf': csrf }, body: JSON.stringify({ workspaceId, confirmation: provider === 'google' ? 'DISCONNECT GOOGLE' : 'DISCONNECT MICROSOFT' }) });
      if (!response.ok) throw new Error(`${label} could not be disconnected safely.`);
      setRuntime((current) => ({ ...current, [provider]: { ...current[provider], [workspaceId]: { configured: connection.configured, status: 'NOT_CONNECTED', scopes: connection.scopes } } }));
      setToast(provider === 'google' ? 'Google disconnected and its authorization was revoked.' : 'Microsoft 365 disconnected from Chief.');
    } catch (caught) { setToast(caught instanceof Error ? caught.message : `${label} could not be disconnected safely.`); }
    finally { setWorking(null); }
  }

  async function createWorkspace() {
    if (!csrf || !workspaceName.trim()) return;
    setWorking('create-workspace');
    try {
      const response = await fetch('/api/workspaces', { method: 'POST', headers: { 'content-type': 'application/json', 'x-chief-csrf': csrf }, body: JSON.stringify({ name: workspaceName, type: classification === 'Private' ? 'Personal' : 'Professional', classification }) });
      const body = await response.json() as { state?: AppState; workspace?: AppState['workspaces'][number]; detail?: string };
      if (!response.ok || !body.state || !body.workspace) throw new Error(body.detail ?? 'Workspace could not be created.');
      setState(body.state);
      setRuntime((current) => ({ ...current, google: { ...current.google, [body.workspace!.id]: { ...disconnected, configured: google.configured } }, microsoft: { ...current.microsoft, [body.workspace!.id]: { ...disconnected, configured: microsoft.configured } } }));
      setWorkspaceName('');
      onWorkspaceCreated(body.workspace.id);
      setToast(`${body.workspace.name} created with an independent data boundary.`);
    } catch (caught) { setToast(caught instanceof Error ? caught.message : 'Workspace could not be created.'); }
    finally { setWorking(null); }
  }

  async function reset() {
    if (!csrf || !window.confirm('Clear all Chief records in every workspace? Connector authorizations remain, but imported evidence, decisions, commitments, and audit history will be removed.')) return;
    setWorking('reset');
    const response = await fetch('/api/state', { method: 'DELETE', headers: { 'x-chief-csrf': csrf, 'x-chief-confirm-reset': 'RESET PERSONAL DATA' } });
    if (response.ok) { const body = await response.json() as { state: AppState }; setState(body.state); onWorkspaceCreated(body.state.workspaces[0]?.id ?? 'northstar'); setToast('Chief data cleared. Your workspaces are empty.'); }
    else setToast('Chief data was not cleared.');
    setWorking(null);
  }

  const connectorCard = (provider: 'google' | 'microsoft') => {
    const connection = provider === 'google' ? google : microsoft;
    const name = provider === 'google' ? 'Google' : 'Microsoft 365';
    const inbox = provider === 'google' ? 'Gmail' : 'Outlook';
    return <article><header><div><h2>{name}</h2><p>{connection.status === 'CONNECTED' ? connection.email : connection.configured ? 'Ready to authorize' : 'Deployment setup required'}</p></div><Status tone={connection.status === 'CONNECTED' ? 'good' : connection.status === 'REAUTH_REQUIRED' ? 'danger' : 'warn'}>{connection.status === 'CONNECTED' ? 'Live' : connection.status === 'REAUTH_REQUIRED' ? 'Reconnect' : 'Not connected'}</Status></header><dl><div><dt>{inbox}</dt><dd>Read latest mail · create drafts only after approval</dd></div><div><dt>Calendar</dt><dd>Read upcoming events · create private events only after approval</dd></div><div><dt>Workspace mapping</dt><dd>{workspace.name} only</dd></div></dl>{connection.status === 'CONNECTED' ? <div className="connection-actions"><button className="solid-button" disabled={working !== null} onClick={() => void sync(provider)}>{working === `${provider}-sync` ? 'Syncing…' : 'Sync now'}</button><button className="outline-button" disabled={working !== null} onClick={() => void disconnect(provider)}>{working === `${provider}-disconnect` ? 'Disconnecting…' : 'Disconnect'}</button></div> : connection.configured ? <a className="outline-button link-button" href={`/api/connections/${provider}/start?workspaceId=${encodeURIComponent(workspaceId)}`}>Connect {name}</a> : <button className="outline-button" disabled>Awaiting {name} credentials</button>}</article>;
  };

  return <><PageHead eyebrow="Control surface" title="Settings" description="Separate workspaces, scoped connectors, privacy, and the editorial standard."/>
    <section className="workspace-manager"><div><p className="eyebrow">Independent data boundaries</p><h2>Workspaces</h2><p>Each connector authorization, sync, search, approval, and audit entry is stored and queried with one workspace ID. Cross-workspace retrieval is blocked.</p></div><div className="workspace-create"><label htmlFor="workspace-name">New workspace</label><div><input id="workspace-name" value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} maxLength={60} placeholder="e.g. Acme work"/><select aria-label="Workspace classification" value={classification} onChange={(event) => setClassification(event.target.value as 'Confidential' | 'Private')}><option>Confidential</option><option>Private</option></select><button className="solid-button" disabled={!workspaceName.trim() || working !== null || state.workspaces.length >= 12} onClick={() => void createWorkspace()}><Plus size={14}/>{working === 'create-workspace' ? 'Creating…' : 'Create isolated workspace'}</button></div><small>{state.workspaces.length} of 12 workspaces · choose the active workspace from the sidebar</small></div></section>
    <section className="settings-grid"><article><header><div><h2>Workspace isolation</h2><p>{workspace.name}</p></div><Status tone="good">Enforced</Status></header><dl><div><dt>Classification</dt><dd>{workspace.classification}</dd></div><div><dt>Cross-workspace retrieval</dt><dd>Blocked</dd></div><div><dt>Time zone</dt><dd>{workspace.defaultTimeZone}</dd></div></dl></article>
      {connectorCard('google')}
      {connectorCard('microsoft')}
      <article><header><div><h2>Live AI</h2><p>OpenAI Responses API</p></div><Status tone={runtime.modelConfigured ? 'good' : 'warn'}>{runtime.modelConfigured ? 'Ready' : 'Setup needed'}</Status></header><dl><div><dt>Reasoning</dt><dd>MODEL_REASONING</dd></div><div><dt>Structured output</dt><dd>Strict schema and source allowlist</dd></div><div><dt>Retrieval boundary</dt><dd>{workspace.name} only</dd></div></dl></article>
      <article><header><div><h2>Notifications</h2><p>Fewer, better interruptions</p></div><Status tone="neutral">Manual</Status></header><dl><div><dt>Daily brief</dt><dd>Generated on sync</dd></div><div><dt>Quiet hours</dt><dd>21:00–06:30</dd></div><div><dt>Low-value updates</dt><dd>Suppressed</dd></div></dl></article>
    </section>
    <section className="editorial-setting"><div><p className="eyebrow">Versioned policy</p><h2>Editorial standard</h2><p>Chief uses this to shape drafts and briefs. Policy and permission constraints remain immutable.</p></div><textarea value={standard} onChange={(event) => setStandard(event.target.value)}/><button className="solid-button" onClick={() => mutate((current) => ({ ...current, editorialStandard: standard }), 'Editorial standard saved.')}>Save standard</button></section>
    <section className="danger-zone"><div><h2>Clear Chief data</h2><p>Remove imported evidence, decisions, commitments, and audit history from every workspace. Google and Microsoft authorizations are managed separately above.</p></div><button className="reject-button" disabled={working !== null} onClick={() => void reset()}><RotateCcw size={15}/>{working === 'reset' ? 'Clearing…' : 'Clear all records'}</button></section>
  </>;
}

function CaptureModal({ state, workspaceId, close, mutate }: { state: AppState; workspaceId: WorkspaceId; close: () => void; mutate: (update: (current: AppState) => AppState, message?: string) => void }) {
  const [raw, setRaw] = useState('');
  const [captureId, setCaptureId] = useState<string | null>(null);
  const capture = state.captures.find((item) => item.id === captureId);
  function classify() {
    const id = nowId('capture');
    mutate((current) => ({ ...current, captures: [{ id, workspaceId, raw, proposedType: 'Unclassified thought', implication: 'Review this capture and decide whether it belongs in governed memory.', status: 'PENDING', createdAt: 'Just now' }, ...current.captures], sources: [{ id: `source-${id}`, workspaceId, type: 'Capture', title: raw.slice(0, 80), author: state.owner.name, timestamp: 'Just now', ingestedAt: 'Just now', excerpt: raw, truthState: 'AI_CANDIDATE', connector: 'Quick capture · Live', freshness: 'Captured just now' }, ...current.sources], audit: [{ id: nowId('audit'), workspaceId, timestamp: 'Just now', actor: 'Chief', action: 'Classified quick capture', detail: 'Created an internal candidate. No canonical record changed.', riskTier: 'R1', outcome: 'PENDING' }, ...current.audit] }));
    setCaptureId(id);
  }
  function decide(approved: boolean) {
    if (!captureId) return;
    mutate((current) => ({ ...current, captures: current.captures.map((item) => item.id === captureId ? { ...item, status: approved ? 'APPROVED' as const : 'REJECTED' as const } : item), sources: current.sources.map((item) => item.id === `source-${captureId}` ? { ...item, truthState: approved ? 'APPROVED' as const : 'REJECTED' as const } : item), audit: [{ id: nowId('audit'), workspaceId, timestamp: 'Just now', actor: state.owner.name, action: approved ? 'Approved capture classification' : 'Rejected capture classification', detail: raw, riskTier: 'R1', outcome: approved ? 'SUCCEEDED' : 'REJECTED' }, ...current.audit] }), approved ? 'Capture approved as governed memory.' : 'Capture rejected and excluded from approved memory.'); close();
  }
  return <div className="modal-layer capture-layer" role="dialog" aria-modal="true" aria-labelledby="capture-title"><button className="modal-scrim" onClick={close} aria-label="Close capture"/><section className="capture-modal"><header><div><div className="command-icon"><Command size={16}/></div><div><p className="eyebrow">Quick capture</p><h2 id="capture-title">Thought → governed candidate</h2></div></div><button onClick={close} aria-label="Close"><X/></button></header>{!capture ? <><textarea aria-label="Quick capture" autoFocus value={raw} onChange={(event) => setRaw(event.target.value)} placeholder="Write the thought before it disappears…"/><div className="capture-options"><span>Workspace · {state.workspaces.find((item) => item.id === workspaceId)?.name}</span><span>Saved as a candidate first</span></div><button className="solid-button" onClick={classify} disabled={!raw.trim()}><Sparkles size={15}/> Save and classify</button></> : <section className="capture-result"><div className="candidate-meta"><Status tone="accent">{capture.proposedType}</Status><span>Owner review required</span></div><h3>{capture.raw}</h3><div className="capture-implication"><span>Implication</span><p>{capture.implication}</p></div><div className="inference"><span>Suggested next action</span>Approve only if this thought belongs in the active workspace’s memory.</div><div className="candidate-actions"><button className="reject-button" onClick={() => decide(false)}><X size={14}/> Reject</button><button className="solid-button" onClick={() => decide(true)}><Check size={14}/> Approve classification</button></div></section>}</section></div>;
}

function SourceDrawer({ source, close }: { source: SourceItem; close: () => void }) {
  return <div className="drawer-layer" role="dialog" aria-modal="true" aria-labelledby="source-title"><button className="drawer-scrim" onClick={close} aria-label="Close source drawer"/><aside className="source-drawer"><header><div><p className="eyebrow">Source evidence</p><h2 id="source-title">{source.title}</h2></div><button onClick={close} aria-label="Close source"><X/></button></header>{source.suspicious && <div className="security-warning"><ShieldCheck size={18}/><div><strong>Untrusted instruction-like content</strong><p>Chief treated this as data, blocked permission escalation, and exposed no write tool.</p></div></div>}<div className="source-meta"><div><span>Source type</span><strong>{source.type}</strong></div><div><span>Author</span><strong>{source.author}</strong></div><div><span>Source timestamp</span><strong>{source.timestamp}</strong></div><div><span>Ingested</span><strong>{source.ingestedAt}</strong></div><div><span>Connector</span><strong>{source.connector}</strong></div><div><span>Truth state</span><Status tone={source.truthState === 'APPROVED' ? 'good' : source.truthState === 'SUPERSEDED' ? 'neutral' : source.suspicious ? 'danger' : 'accent'}>{source.truthState.replace('_',' ')}</Status></div></div><section className="excerpt"><span>Relevant excerpt</span><blockquote>{source.excerpt}</blockquote></section><div className="freshness"><Clock3 size={15}/><span>{source.freshness}</span></div><div className="source-footer"><ShieldCheck size={15}/><span>Authorized for this workspace only</span></div></aside></div>;
}

function EmptyState({ title, copy }: { title: string; copy: string }) { return <div className="empty-state"><ClipboardCheck size={28}/><h2>{title}</h2><p>{copy}</p></div>; }

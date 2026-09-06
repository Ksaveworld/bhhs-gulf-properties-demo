import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, Button, Drawer, Input, Modal, Select, Tag } from 'antd';
import { buildClientBrief, factHasChange, selectBriefEvidence, type ClientMaterial, type MaterialKind } from '../../../../shared/client-brief';
import { createKhalidStory, storyRequirement, type ClientStory, type Payment } from '../../../../shared/client-story';
import { clientDisplayName } from '../../../../shared/property-presentation';
import type { ClientRequirement, ListingSnapshot } from '../../../../shared/types';
import { ClientStoryBrief } from './ClientStoryBrief';
import './client-story.css';

type Props = { active?: boolean; areas: string[]; listings: ListingSnapshot[]; requirements: ClientRequirement[]; canSave: boolean; onSignIn: () => void;
  onSave: (draft: ClientRequirement, baseline: ClientRequirement | null, onSaved?: (saved: ClientRequirement) => void) => Promise<void>;
  onOpenProperty: (id: string) => void; onOpenClient: (req: ClientRequirement) => void; quickTools: ReactNode; onNewClient?: () => void };
type Phase = 'idle' | 'reading' | 'identity' | 'extract' | 'missing' | 'done';
const kinds: MaterialKind[] = ['Call transcript', 'WhatsApp', 'Email', 'Photo notes', 'Sales note'];
const readTasks = ['Review call material', 'Read conversations', 'Read emails and photo notes', 'Compare client records', 'Review transaction references'];
const demoCounts = ['3 calls / 18 minutes', '47 messages / 12 useful details', '2 emails / 1 floor plan', '1 candidate · confirmation required', '214 illustrative deals / 2 client cases'];

export function ClientAgentWorkspace({ active = true, areas, listings, requirements, canSave, onSignIn, onSave, onOpenProperty, onOpenClient, quickTools, onNewClient }: Props) {
  const [text, setText] = useState(''), [kind, setKind] = useState<MaterialKind>('Sales note');
  const [story, setStory] = useState<ClientStory | null>(null), [phase, setPhase] = useState<Phase>('idle');
  const [detail, setDetail] = useState(false), [readStep, setReadStep] = useState(0), [choices, setChoices] = useState<Record<string, number>>({});
  const [toolsOpen, setToolsOpen] = useState(false), [error, setError] = useState(''), [working, setWorking] = useState(false);
  const [candidateId, setCandidateId] = useState(''), [newOpen, setNewOpen] = useState(false), [newName, setNewName] = useState(''), [phone, setPhone] = useState('');
  const [addPayment, setAddPayment] = useState(false), [payment, setPayment] = useState<Payment>('cash');
  const [identityResult, setIdentityResult] = useState(''), [quote, setQuote] = useState(''), [saved, setSaved] = useState(false);
  const file = useRef<HTMLInputElement>(null), generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  useEffect(() => { if (!active) { setToolsOpen(false); setNewOpen(false); } }, [active]);
  useEffect(() => {
    if (phase !== 'reading') return;
    if (readStep >= 5) { setPhase('identity'); return; }
    const id = setTimeout(() => setReadStep(v => v + 1), matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 500);
    return () => clearTimeout(id);
  }, [phase, readStep]);
  if (!active) return null;
  const conflicts = story?.brief.facts.filter(factHasChange) ?? [];
  const allChosen = conflicts.every(f => choices[f.id] !== undefined);
  const candidate = requirements.find(req => req.requirement_id === candidateId) ?? story?.baseline ?? null;
  const phaseOrder = ['idle', 'reading', 'identity', 'extract', 'missing', 'done'];
  const atLeast = (value: Phase) => phaseOrder.indexOf(phase) >= phaseOrder.indexOf(value);
  async function begin(example = false) {
    if (working || (!example && !text.trim())) return;
    const gen = ++generation.current; setWorking(true); setError('');
    try {
      let next: ClientStory;
      if (example) next = await createKhalidStory();
      else {
        const material: ClientMaterial = { id: crypto.randomUUID(), kind, title: `${kind} · new material`, text: text.trim(), synthetic: false };
        const previous = phase === 'done' ? story : null;
        next = { brief: await buildClientBrief([material], previous?.brief.draft ?? null, areas), baseline: previous?.brief.draft ?? null, saveTarget: previous?.saveTarget ?? null,
          materials: [...(previous?.materials ?? []), material], fixture: false, phone: previous?.phone ?? '', payment: previous?.payment ?? 'unknown',
          paymentSource: previous?.paymentSource ?? '', decision: previous?.decision ?? '', decisionSource: previous?.decisionSource ?? '', call: null };
      }
      if (gen !== generation.current) return;
      setStory(next); setPhase('reading'); setReadStep(0); setChoices({}); setIdentityResult(''); setDetail(false); setSaved(false); setQuote(''); setCandidateId(''); setText(''); setAddPayment(false);
    } catch { setError('The material could not be read. Your input has been retained.'); }
    finally { if (gen === generation.current) setWorking(false); }
  }
  async function confirmIdentity(isNew = false) {
    if (!story || working) return;
    const gen = generation.current; setWorking(true);
    try {
      const baseline = isNew ? null : story.fixture || (!candidate && story.baseline) ? story.baseline : candidate;
      const newMaterial = story.materials.at(-1);
      const brief = await buildClientBrief(!story.fixture && story.baseline && !candidate && !isNew && newMaterial ? [newMaterial] : story.materials, baseline, areas);
      if (gen !== generation.current) return;
      if (isNew) { brief.draft.client_alias = newName.trim() || brief.draft.client_alias; brief.draft.client_id = `SESSION-C-${crypto.randomUUID()}`; }
      setStory({ ...story, baseline, brief, saveTarget: isNew ? null : candidateId ? candidate : story.saveTarget ?? null, phone: isNew ? phone.trim() : story.phone });
      setIdentityResult(isNew ? `New client: ${brief.draft.client_alias || 'Name to confirm'}` : `Confirmed: ${brief.draft.client_alias}`);
      setNewOpen(false); setPhase('extract'); setChoices({});
    } catch { setError('Could not link this record. Try again; no record has been changed.'); }
    finally { if (gen === generation.current) setWorking(false); }
  }
  function finishPayment(value: Payment) {
    if (!story) return;
    const id = `payment-${crypto.randomUUID()}`;
    const material: ClientMaterial = { id, kind: 'Sales note', title: 'Sales confirmation · payment', text: `Sales confirmed payment method: ${value}.`, synthetic: story.fixture };
    setStory({ ...story, payment: value, paymentSource: value === 'unknown' ? '' : id, materials: value === 'unknown' ? story.materials : [material, ...story.materials] }); setPhase('done');
  }
  async function save() {
    if (!story || working || saved) return;
    if (!canSave) { onSignIn(); return; }
    setWorking(true); setError('');
    try { await onSave(storyRequirement(story), story.saveTarget ?? null, req => setStory(current => current && ({ ...current, baseline: req, saveTarget: req }))); setSaved(true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Saving failed. The session draft is retained.'); }
    finally { setWorking(false); }
  }
  async function importText(f?: File) {
    if (!f) return;
    if (!/\.(txt|md|csv)$/i.test(f.name) || f.size > 1024 * 1024) { setError('Choose a .txt, .md or .csv file smaller than 1 MB. For audio and images, use a transcript or description.'); return; }
    try { setText(await f.text()); setError(''); } catch { setError('Could not open the file. Paste its text instead.'); }
  }
  const urgency = (req: ClientRequirement) => /viewing|visit|second/i.test(req.intent_evidence ?? '') ? 1 : 0;
  const priority = [...requirements].sort((a, b) => urgency(b) - urgency(a) || (Date.parse(b.captured_at) || 0) - (Date.parse(a.captured_at) || 0)).filter((req, index, rows) => rows.findIndex(row => row.client_id === req.client_id) === index);
  if (detail && story) return <><ClientStoryBrief story={story} onChange={next => { setStory(next); setSaved(false); }} onBack={() => setDetail(false)} onAdd={() => setDetail(false)} listings={listings} onOpenProperty={onOpenProperty} onSave={!story.fixture ? () => void save() : undefined} saveLabel={working ? 'Saving…' : saved ? 'Client copy saved' : canSave ? 'Save client copy' : 'Sign in to save client copy'} />{error && <Alert type="error" message={error} />}</>;
  return <section className="story-home" aria-label="Client intelligence workspace">
    <Tag className="story-demo">Demo</Tag><h1>Your client.<br />Their next home.</h1><p className="story-lede">Bring the calls, chats and notes together.<br />See what changed, which homes fit, and what to ask next.</p>
    {phase !== 'idle' && story && <div className="story-conversation" aria-label="Client analysis conversation">
      <div className="story-user-message">{story.fixture ? 'Read the Khalid example materials.' : story.materials.filter(m => !m.synthetic).map(m => m.text).join('\n')}</div>
      <article className="story-message"><span className="story-agent-mark">A</span><div><div className="story-message-heading"><h3>Reading the client material</h3>{phase === 'reading' && <Button type="text" onClick={() => setReadStep(5)}>Skip animation</Button>}</div>{story.fixture && <small>Preset example counts · channels are not connected</small>}<ul className="story-reading">{readTasks.map((task, i) => <li key={task} className={readStep > i ? 'done' : ''}><span>{readStep > i ? '✓' : '◦'} {task}</span><b>{readStep > i ? story.fixture ? demoCounts[i] : i === 0 ? 'Text input; no audio transcription' : i === 1 ? `${story.materials.filter(m => m.kind === 'WhatsApp').length} text sources` : i === 2 ? `${story.materials.filter(m => m.kind === 'Email' || m.kind === 'Photo notes').length} text sources` : i === 3 ? `${requirements.length} available · select and confirm` : 'No transaction analysis performed' : 'Waiting'}</b></li>)}</ul></div></article>
      {atLeast('identity') && <article className="story-message"><span className="story-agent-mark">A</span><div><h3>Confirm the client</h3>{identityResult ? <p>✓ {identityResult}</p> : <div className="story-identity">
        {story.fixture ? <><h2>Khalid Al Mansouri</h2><p>CRM #C-2026-0114 · Created 14 Jan</p><ul><li>Phone ending 418 matches the example CRM contact.</li><li>WhatsApp name matches the contact.</li><li className="story-caution">Location differs: CRM Dubai Marina, latest material Palm Jumeirah.</li></ul></> : <><p>Select a possible existing record, then confirm the identity. Text alone does not establish a match.</p><Select aria-label="Link to client" placeholder="Select a client record" value={candidateId || undefined} onChange={setCandidateId} options={requirements.map(req => ({ value: req.requirement_id, label: clientDisplayName(req) }))} /><p>{candidate ? `Selected record: ${candidate.client_id}. Verify the contact details with the source.` : 'Or create a separate client.'}</p></>}
        <div className="story-button-row"><Button type="primary" disabled={working || (!story.fixture && !candidate)} onClick={() => void confirmIdentity()}>Confirm same client</Button><Button disabled={working} onClick={() => { setNewName(story.brief.draft.client_alias || ''); setPhone(''); setNewOpen(true); }}>Not the same — create new</Button></div></div>}</div></article>}
      {atLeast('extract') && <article className="story-message"><span className="story-agent-mark">A</span><div><h3>What the material tells us</h3><p>{story.brief.facts.filter(f => f.evidence.length).length + (story.fixture ? 1 : 0)} fields with source evidence. Review every conflict before continuing.</p>
        {story.brief.facts.filter(f => f.evidence.length && (factHasChange(f) || f.evidence.every(e => e.sourceId !== 'baseline'))).map(fact => <div className={`story-extracted ${factHasChange(fact) ? 'conflict' : ''}`} key={fact.id} role="group" aria-label={`${fact.label} review`}><div><Tag color={factHasChange(fact) ? 'gold' : 'green'}>{factHasChange(fact) ? 'CONFLICT' : 'NEW'}</Tag><b>{fact.label}</b></div>{fact.evidence.map((evidence, index) => <div key={`${evidence.sourceId}-${index}`}><button className="story-quote-link" onClick={() => setQuote(story.materials.find(m => m.id === evidence.sourceId)?.text ?? story.baseline?.raw_request ?? '')}>{evidence.label}: {evidence.display} ↗</button>{factHasChange(fact) && <Button size="small" type={choices[fact.id] === index ? 'primary' : 'default'} disabled={phase !== 'extract'} aria-label={`${fact.label}: ${evidence.sourceId === 'baseline' ? 'Keep CRM' : 'Use new information'}`} onClick={() => { setStory({ ...story, brief: selectBriefEvidence(story.brief, fact.id, index) }); setChoices({ ...choices, [fact.id]: index }); }}>{evidence.sourceId === 'baseline' ? 'Keep CRM' : 'Use new information'}</Button>}</div>)}</div>)}
        {story.fixture && <div className="story-extracted"><Tag color="green">NEW</Tag><b>Decision makers</b><button className="story-quote-link" onClick={() => setQuote(story.materials.find(m => m.id === 'call-mar12')?.text ?? '')}>{story.decision} · Call 12 Mar ↗</button></div>}
        <details><summary>Consistent with the existing record ({story.brief.facts.filter(f => f.evidence.some(e => e.sourceId === 'baseline') && !factHasChange(f)).length})</summary>{story.brief.facts.filter(f => f.evidence.some(e => e.sourceId === 'baseline') && !factHasChange(f)).map(f => <p key={f.id}>{f.label}: {f.evidence[f.selected].display}</p>)}</details>
        {quote && <blockquote aria-label="Extraction source quote">{quote}</blockquote>}{phase === 'extract' && <Button type="primary" disabled={!allChosen} onClick={() => setPhase('missing')}>Confirm extracted information</Button>}
      </div></article>}
      {atLeast('missing') && <article className="story-message"><span className="story-agent-mark">A</span><div><h3>One question before the next step</h3><p>{phase === 'done' ? story.payment === 'unknown' ? 'Payment deferred to the next call. Added to the client brief and first follow-up question.' : `Payment confirmed: ${story.payment}. Linked to your confirmation.` : 'Payment has not been verified. Cash or mortgage will affect the completion plan.'}</p>{phase === 'missing' && <><div className="story-button-row"><Button onClick={() => finishPayment('unknown')}>Confirm on next call</Button><Button onClick={() => setAddPayment(true)}>Add now</Button></div>{addPayment && <div className="story-button-row"><Select aria-label="Payment method" value={payment} onChange={setPayment} options={[{ value: 'cash', label: 'Cash' }, { value: 'mortgage', label: 'Mortgage' }]} /><Button type="primary" onClick={() => finishPayment(payment)}>Confirm payment</Button></div>}</>}</div></article>}
      {phase === 'done' && <article className="story-message"><span className="story-agent-mark">✓</span><div><h3>{story.brief.draft.client_alias || 'Client'} — brief ready</h3><p>Your confirmations are applied to this session. The conversation stays here.</p><Button type="primary" onClick={() => { setDetail(true); window.scrollTo(0, 0); }}>View client brief →</Button></div></article>}
    </div>}
    <div className="story-composer"><Input.TextArea aria-label="Client material" value={text} onChange={e => setText(e.target.value)} rows={4} placeholder="Paste a note, or import this client’s material below." disabled={working || (phase !== 'idle' && phase !== 'done')} /><div className="story-tray">{kinds.map(value => <button key={value} aria-pressed={kind === value} className={kind === value ? 'selected' : ''} onClick={() => setKind(value)}>{value === 'Call transcript' ? 'Call notes' : value === 'Photo notes' ? 'Photos' : value}</button>)}<Button type="primary" disabled={!text.trim() || working || (phase !== 'idle' && phase !== 'done')} onClick={() => void begin()}>Read this client →</Button></div></div>
    <div className="story-home-tools"><Button type="text" onClick={() => file.current?.click()}>Import text</Button><Button type="text" disabled={working || (phase !== 'idle' && phase !== 'done')} onClick={() => void begin(true)}>Use example materials</Button><input ref={file} hidden type="file" accept=".txt,.md,.csv" aria-label="Import client text file" onChange={e => { void importText(e.target.files?.[0]); e.target.value = ''; }} /></div><p className="story-muted">Every detail stays linked to its source. Demo analysis uses text and preset examples; calls and channels are not connected.</p>{error && <Alert type="error" message={error} closable onClose={() => setError('')} />}
    <section className="story-resume"><div className="story-message-heading"><h2>Needs you today</h2><Button type="text" onClick={onNewClient ?? (() => setToolsOpen(true))}>New client +</Button></div><p className="story-muted">Viewing interest first, then most recently updated. No inferred intent score.</p>
      <button className="story-client-row" onClick={() => { if (story?.fixture && phase === 'done') setDetail(true); else void begin(true); }} disabled={working || (phase !== 'idle' && phase !== 'done')}><span><b>Khalid Al Mansouri</b><small>Demo story · 12 Mar</small></span><p>{story?.call?.commitments || 'Second viewing requested; service charge history still to send.'}</p></button>
      {priority.slice(0, 3).map(req => <button className="story-client-row" key={req.requirement_id} onClick={() => onOpenClient(req)}><span><b>{clientDisplayName(req)}</b><small>{Number.isFinite(Date.parse(req.captured_at)) ? new Date(req.captured_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'Update date unknown'}</small></span><p>{req.intent_evidence || req.missing_questions?.split('\n')[0] || 'Review current needs and agree the next conversation.'}</p></button>)}
    </section><Button type="text" aria-label="Quick tools" onClick={() => setToolsOpen(true)}>Quick tools</Button>
    <Drawer title="Quick tools" open={toolsOpen} width="min(900px, 96vw)" onClose={() => setToolsOpen(false)}>{quickTools}</Drawer>
    <Modal title="Create a separate client" open={newOpen} onCancel={() => setNewOpen(false)} onOk={() => void confirmIdentity(true)} okText="Create and continue" confirmLoading={working}><label className="story-field">Client name<Input aria-label="New client name" value={newName} onChange={e => setNewName(e.target.value)} /></label><label className="story-field">Phone<Input aria-label="New client phone" value={phone} onChange={e => setPhone(e.target.value)} /></label><p>A separate session draft. No existing record will be overwritten.</p></Modal>
  </section>;
}
